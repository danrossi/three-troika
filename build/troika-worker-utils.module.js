/**
 * Main content for the worker that handles the loading and execution of
 * modules within it.
 */
function workerBootstrap() {
  const modules = Object.create(null);

  // Handle messages for registering a module
  function registerModule({id, name, dependencies=[], init=function(){}, getTransferables=null}, callback) {
    // Only register once
    if (modules[id]) return

    try {
      // If any dependencies are modules, ensure they're registered and grab their value
      dependencies = dependencies.map(dep => {
        if (dep && dep.isWorkerModule) {
          registerModule(dep, depResult => {
            if (depResult instanceof Error) throw depResult
          });
          dep = modules[dep.id].value;
        }
        return dep
      });

      // Rehydrate functions
      init = rehydrate(`<${name}>.init`, init);
      if (getTransferables) {
        getTransferables = rehydrate(`<${name}>.getTransferables`, getTransferables);
      }

      // Initialize the module and store its value
      let value = null;
      if (typeof init === 'function') {
        value = init(...dependencies);
      } else {
      }
      modules[id] = {
        id,
        value,
        getTransferables
      };
      callback(value);
    } catch(err) {
      if (!(err && err.noLog)) ;
      callback(err);
    }
  }

  // Handle messages for calling a registered module's result function
  function callModule({id, args}, callback) {
    if (!modules[id] || typeof modules[id].value !== 'function') {
      callback(new Error(`Worker module ${id}: not found or its 'init' did not return a function`));
    }
    try {
      const result = modules[id].value(...args);
      if (result && typeof result.then === 'function') {
        result.then(handleResult, rej => callback(rej instanceof Error ? rej : new Error('' + rej)));
      } else {
        handleResult(result);
      }
    } catch(err) {
      callback(err);
    }
    function handleResult(result) {
      try {
        let tx = modules[id].getTransferables && modules[id].getTransferables(result);
        if (!tx || !Array.isArray(tx) || !tx.length) {
          tx = undefined; //postMessage is very picky about not passing null or empty transferables
        }
        callback(result, tx);
      } catch(err) {
        callback(err);
      }
    }
  }

  function rehydrate(name, str) {
    let result = void 0;
    self.troikaDefine = r => result = r;
    let url = URL.createObjectURL(
      new Blob(
        [`/** ${name.replace(/\*/g, '')} **/\n\ntroikaDefine(\n${str}\n)`],
        {type: 'application/javascript'}
      )
    );
    try {
      importScripts(url);
    } catch(err) {
    }
    URL.revokeObjectURL(url);
    delete self.troikaDefine;
    return result
  }

  // Handler for all messages within the worker
  self.addEventListener('message', e => {
    const {messageId, action, data} = e.data;
    try {
      // Module registration
      if (action === 'registerModule') {
        registerModule(data, result => {
          if (result instanceof Error) {
            postMessage({
              messageId,
              success: false,
              error: result.message
            });
          } else {
            postMessage({
              messageId,
              success: true,
              result: {isCallable: typeof result === 'function'}
            });
          }
        });
      }
      // Invocation
      if (action === 'callModule') {
        callModule(data, (result, transferables) => {
          if (result instanceof Error) {
            postMessage({
              messageId,
              success: false,
              error: result.message
            });
          } else {
            postMessage({
              messageId,
              success: true,
              result
            }, transferables || undefined);
          }
        });
      }
    } catch(err) {
      postMessage({
        messageId,
        success: false,
        error: err.stack
      });
    }
  });
}

/**
 * Fallback for `defineWorkerModule` that behaves identically but runs in the main
 * thread, for when the execution environment doesn't support web workers or they
 * are disallowed due to e.g. CSP security restrictions.
 */
function defineMainThreadModule(options) {
  let moduleFunc = function(...args) {
    return moduleFunc._getInitResult().then(initResult => {
      if (typeof initResult === 'function') {
        return initResult(...args)
      } else {
        throw new Error('Worker module function was called but `init` did not return a callable function')
      }
    })
  };
  moduleFunc._getInitResult = function() {
    // We can ignore getTransferables in main thread. TODO workerId?
    let {dependencies, init} = options;

    // Resolve dependencies
    dependencies = Array.isArray(dependencies) ? dependencies.map(dep =>
      dep && dep._getInitResult ? dep._getInitResult() : dep
    ) : [];

    // Invoke init with the resolved dependencies
    let initPromise = Promise.all(dependencies).then(deps => {
      return init.apply(null, deps)
    });

    // Cache the resolved promise for subsequent calls
    moduleFunc._getInitResult = () => initPromise;

    return initPromise
  };
  return moduleFunc
}

let supportsWorkers = () => {
  let supported = false;

  // Only attempt worker initialization in browsers; elsewhere it would just be
  // noise e.g. loading into a Node environment for SSR.
  if (typeof window !== 'undefined' && typeof window.document !== 'undefined') {
    try {
      // TODO additional checks for things like importScripts within the worker?
      //  Would need to be an async check.
      let worker = new Worker(
        URL.createObjectURL(new Blob([''], { type: 'application/javascript' }))
      );
      worker.terminate();
      supported = true;
    } catch (err) {
    }
  }

  // Cached result
  supportsWorkers = () => supported;
  return supported
};

let _workerModuleId = 0;
let _messageId = 0;
let _allowInitAsString = false;
const workers = Object.create(null);
const registeredModules = Object.create(null); //workerId -> Set<unregisterFn>
const openRequests = Object.create(null);


/**
 * Define a module of code that will be executed with a web worker. This provides a simple
 * interface for moving chunks of logic off the main thread, and managing their dependencies
 * among one another.
 *
 * @param {object} options
 * @param {function} options.init
 * @param {array} [options.dependencies]
 * @param {function} [options.getTransferables]
 * @param {string} [options.name]
 * @param {string} [options.workerId]
 * @return {function(...[*]): {then}}
 */
function defineWorkerModule(options) {
  if ((!options || typeof options.init !== 'function') && !_allowInitAsString) {
    throw new Error('requires `options.init` function')
  }
  let {dependencies, init, getTransferables, workerId} = options;

  if (!supportsWorkers()) {
    return defineMainThreadModule(options)
  }

  if (workerId == null) {
    workerId = '#default';
  }
  const id = `workerModule${++_workerModuleId}`;
  const name = options.name || id;
  let registrationPromise = null;

  dependencies = dependencies && dependencies.map(dep => {
    // Wrap raw functions as worker modules with no dependencies
    if (typeof dep === 'function' && !dep.workerModuleData) {
      _allowInitAsString = true;
      dep = defineWorkerModule({
        workerId,
        name: `<${name}> function dependency: ${dep.name}`,
        init: `function(){return (\n${stringifyFunction(dep)}\n)}`
      });
      _allowInitAsString = false;
    }
    // Grab postable data for worker modules
    if (dep && dep.workerModuleData) {
      dep = dep.workerModuleData;
    }
    return dep
  });

  function moduleFunc(...args) {
    // Register this module if needed
    if (!registrationPromise) {
      registrationPromise = callWorker(workerId,'registerModule', moduleFunc.workerModuleData);
      const unregister = () => {
        registrationPromise = null;
        registeredModules[workerId].delete(unregister);
      }
      ;(registeredModules[workerId] || (registeredModules[workerId] = new Set())).add(unregister);
    }

    // Invoke the module, returning a promise
    return registrationPromise.then(({isCallable}) => {
      if (isCallable) {
        return callWorker(workerId,'callModule', {id, args})
      } else {
        throw new Error('Worker module function was called but `init` did not return a callable function')
      }
    })
  }
  moduleFunc.workerModuleData = {
    isWorkerModule: true,
    id,
    name,
    dependencies,
    init: stringifyFunction(init),
    getTransferables: getTransferables && stringifyFunction(getTransferables)
  };
  return moduleFunc
}

/**
 * Terminate an active Worker by a workerId that was passed to defineWorkerModule.
 * This only terminates the Worker itself; the worker module will remain available
 * and if you call it again its Worker will be respawned.
 * @param {string} workerId
 */
function terminateWorker(workerId) {
  // Unregister all modules that were registered in that worker
  if (registeredModules[workerId]) {
    registeredModules[workerId].forEach(unregister => {
      unregister();
    });
  }
  // Terminate the Worker object
  if (workers[workerId]) {
    workers[workerId].terminate();
    delete workers[workerId];
  }
}

/**
 * Stringifies a function into a form that can be deserialized in the worker
 * @param fn
 */
function stringifyFunction(fn) {
  let str = fn.toString();
  // If it was defined in object method/property format, it needs to be modified
  if (!/^function/.test(str) && /^\w+\s*\(/.test(str)) {
    str = 'function ' + str;
  }
  return str
}


function getWorker(workerId) {
  let worker = workers[workerId];
  if (!worker) {
    // Bootstrap the worker's content
    const bootstrap = stringifyFunction(workerBootstrap);

    // Create the worker from the bootstrap function content
    worker = workers[workerId] = new Worker(
      URL.createObjectURL(
        new Blob(
          [`/** Worker Module Bootstrap: ${workerId.replace(/\*/g, '')} **/\n\n;(${bootstrap})()`],
          {type: 'application/javascript'}
        )
      )
    );

    // Single handler for response messages from the worker
    worker.onmessage = e => {
      const response = e.data;
      const msgId = response.messageId;
      const callback = openRequests[msgId];
      if (!callback) {
        throw new Error('WorkerModule response with empty or unknown messageId')
      }
      delete openRequests[msgId];
      callback(response);
    };
  }
  return worker
}

// Issue a call to the worker with a callback to handle the response
function callWorker(workerId, action, data) {
  return new Promise((resolve, reject) => {
    const messageId = ++_messageId;
    openRequests[messageId] = response => {
      if (response.success) {
        resolve(response.result);
      } else {
        reject(new Error(`Error in worker ${action} call: ${response.error}`));
      }
    };
    getWorker(workerId).postMessage({
      messageId,
      action,
      data
    });
  })
}

export { defineWorkerModule, stringifyFunction, terminateWorker };
