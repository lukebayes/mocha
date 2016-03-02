/**
 * Module dependencies.
 */

var BaseRunner = require('../runner');
var EventEmitter = require('events').EventEmitter;
var childProcess = require('child_process');
var inherits = require('../utils').inherits;
var os = require('os');
var path = require('path');

function ClusterRunner(suite, delay, files) {
  EventEmitter.call(this);
  var self = this;

  // NOTE(lbayes): Do not call BaseRunner constructor here.

  this._pendingFiles = [];
  this._workers = [];
  this._globals = [];
  this.files = files;
  this.multicoreCount = 2;
  this._isStarted = false;
  console.log('CLUSTER RUNNER ARGS:', process.argv);
};

/**
 * Inherit from `EventEmitter.prototype`.
 */
inherits(ClusterRunner, EventEmitter);

/**
 * Delegate some configuration methods to the base runner.
 * TODO(lbayes): Patch up the rest of the expected Runner methods?
 * NOTE(lbayes): I don't really want to extend the entire BaseRunner,
 * because it makes a lot of stateful decisions over time.
 */
ClusterRunner.prototype.globals = function(arr) {
  // DONOTSUBMIT(lbayes): Extract BaseRunner from lib/runner.js
  return BaseRunner.prototype.globals.call(this, arr);
};

ClusterRunner.prototype.globalProps = function(arr) {
  // DONOTSUBMIT(lbayes): Extract BaseRunner from lib/runner.js
  return BaseRunner.prototype.globalProps.call(this);
};

ClusterRunner.prototype.grep = function(re, invert) {
  // DONOTSUBMIT(lbayes): Extract BaseRunner from lib/runner.js
  return BaseRunner.prototype.grep.call(this, re, invert);
};

ClusterRunner.prototype.grepTotal = function(suite) {
  // DONOTSUBMIT(lbayes): Extract BaseRunner from lib/runner.js
  return BaseRunner.prototype.grepTotal.call(this, suite);
};

ClusterRunner.prototype._exitIfNecessary = function() {
  if (this._pendingFiles.length === 0 && this._workers.length === 0) {
    console.log("EXITING");
    this._onComplete && this._onComplete();
  }
};

ClusterRunner.prototype._createWorkerErrorHandler = function(worker) {
  return function(err) {
    console.error('WORKER [' + worker.pid + '] ERROR:');
    console.error(err.stack);
  }.bind(this);
};

/**
 * Ensure we have the expected number of workers currently active.
 */
ClusterRunner.prototype._createWorkersIfNecessary = function() {
  var workerCount = Math.min(this._pendingFiles.length, this.multicoreCount);
  console.log('worker count:', workerCount, this.multicoreCount);

  while (this._workers.length < workerCount) {
    this._createWorker();
  }
};

ClusterRunner.prototype._onReporterEvent = function(worker, payload) {
  if (payload.test) {
    this._mixIntoTest(payload.test);
  }

  switch (payload.eventName) {
    case 'start':
    case 'end':
      this.emit(payload.eventName);
      break;
    case 'suite':
    case 'suite end':
    case 'suite':
      this.emit(payload.eventName, payload.suite);
      break;
    case 'test':
    case 'test end':
    case 'pass':
      this.emit(payload.eventName, payload.test);
      break;
    case 'fail':
      this.emit(payload.eventName, payload.test, payload.error);
      break;
    case 'hook':
    case 'hook end':
      // TODO(lbayes): Wire this up
      this.emit(payload.eventName, payload.hook);
      break;
    default:
      console.log('UNHANDLED EVENT:', worker.pid, payload);
  }
  this.emit(payload.eventName, payload.test || payload.suite, payload.error);
};

ClusterRunner.prototype._createMessageHandler = function(worker) {
  var self = this;
  return function(payload) {
    switch (payload.type) {
      case 'worker-ready':
        console.log('WORKER READY!!!!!!!!!!!!!!!! ', worker.pid);
        worker.isReady = true;
        self._flushWork();
        break;
      case 'reporter-event':
        try {
          self._onReporterEvent(worker, payload);
        } catch (err) {
          console.log('YOOOOOOOOOOOOOOOOOO:', err.stack);
        }
        break;
      default:
        console.log('---------------------');
        console.log('worker message handler with:', worker.pid, arguments);
    }
  };
};

ClusterRunner.prototype._getWorkerArgs = function() {
  if (!this._workerArgs) {
    var blacklistedFlags = ['--multicore', '--multicore-count', '--reporter'];
    var blacklistedPrevFlags = ['--multicore-count', '--reporter'];
    var args = process.argv.slice(2);

    var result = args.filter(function(arg, index) {
      return blacklistedFlags.indexOf(args[index]) === -1 &&
        blacklistedPrevFlags.indexOf(args[index - 1]) === -1;
    });

    result.push('--reporter');
    result.push('cluster');
    result.push('--is-worker');

    this._workerArgs = result;
  };
  return this._workerArgs;
};

ClusterRunner.prototype._createWorker = function() {
  console.log('CREATE WORKER at index:', this._workers.length);
  var args = this._getWorkerArgs();
  var workerApplication = path.normalize(__dirname + '/../../bin/_mocha');

  console.log('about to create worker at:', workerApplication);

  var worker = childProcess.fork(workerApplication, args, {
    cwd: process.cwd,
    env: process.env,
    stdio: 'inherit'
  });

  console.log('FORKED:', worker.pid);

  // Workers will notify us when they are ready for work.
  worker.isReady = false;
  // Workers are not the active worker by default.
  worker.isActive = false;

  this._workers.push(worker);

  // Listen for messages on the fork socket.
  worker.on('message', this._createMessageHandler(worker));
  worker.on('exit', this._createWorkerExitHandler(worker));
  worker.on('error', this._createWorkerErrorHandler(worker));
};

ClusterRunner.prototype._getIndexByPid = function(pid) {
  return this._workers.findIndex(function(entry) {
    return entry.pid === pid;
  });
};

ClusterRunner.prototype._getWorkerByPid = function(pid) {
  return this._workers.find(function(entry) {
    return entry.pid === pid;
  });
};

ClusterRunner.prototype._getInactiveWorkers = function() {
  return this._workers.filter(function(worker) {
    return worker.isReady && !worker.isActive;
  });
};

/**
 * Called from workers after each batch.
 */
ClusterRunner.prototype.onWorkerComplete = function(pid) {
  // A worker is finished running a given test.
  this._getWorkerByPid(pid).isActive = false;
  this._flushWork();
};

ClusterRunner.prototype._mixIntoTest = function(test) {
  test.fullTitle = function() {
    return test._fullTitle;
  };
  test.slow = function() {
    return false;
  };
  test.isPending = function() {
    return this.pending;
  };
  test.currentRetry = function(value) {
    this._currentRetry = value;
  };
  test.retries = function() {
    throw new Error('Not implemented');
  };
};

/**
 * Receive a reporter event from a worker.
ClusterRunner.prototype._onReporterEventBAK = function(pid, eventName, test, failure) {
  // Block start and end events.
  if (eventName === 'start') {
    if (this._isStarted) {
      return;
    } else {
      this._isStarted = true;
    }
  }

  //if (eventName === 'end') {
    //return;
  //}

  // TODO(lbayes): Deserialize tests and suites from data more appropriately.
  if (test) {
    test.fullTitle = function() {
      return test._fullTitle;
    };
    test.slow = function() {
      return false;
    };
    test.isPending = function() {
      return this.pending;
    };
    test.currentRetry = function(value) {
      this._currentRetry = value;
    };
    test.retries = function() {
      throw new Error('Not implemented');
    };
  }

  this.emit(eventName, test, failure);
};
 */

/**
 * Notification that is received when a worker exits.
 *
 * In typical cases, this code will kill workers explicitly and might be able
 * to clean up more directly, but this code path is required for conditions
 * where workers exit unexpectedly.
 *
 */
ClusterRunner.prototype._createWorkerExitHandler = function(worker) {
  return function() {
    console.log('WORKER EXITED');
    var workerIndex = this._getIndexByPid(worker.pid);
    if (workerIndex > -1) {
      this._workers.splice(workerIndex, 1);
      this._exitIfNecessary();
    }
  }.bind(this);
};

// End worker message handlers

/**
 * Run the tests using the configuration that was provided to the constructor
 * and call the optionally provided onComplete handler when all tests have
 * finished.
 */
ClusterRunner.prototype.run = function(opt_onComplete) {
  this.emit('start');

  this._onComplete = opt_onComplete;

  console.log('RUN TEST FILES WITH:', this.files.length);
  this._runTestFiles(this.files);
};

ClusterRunner.prototype._runTestFiles = function(files) {
  console.log('_runTestFiles with:', files);
  this._pendingFiles = this._pendingFiles.concat(files);

  this._flushWork();
};

ClusterRunner.prototype._sendMessage = function(worker, message, payload) {
  if (!worker.isReady) {
    throw new Error('Attempted to send message before worker was ready!');
  }

  try {
    console.log('SENDING MSG:', message, 'to', worker.pid, 'connected?', worker.connected, 'with:', payload);
    if (!worker.send({message: message, payload: payload})) {
      console.error('FAILED TO SEND:', message, payload);
    }
  } catch (err) {
    console.log('WORKER SEND FAILURE:', err);
  }
};

ClusterRunner.prototype._flushWork = function() {
  var self = this;

  var workerCount = this._workers.length;
  this._createWorkersIfNecessary();

  if (workerCount !== this._workers.length) {
    console.log('>>>>>>>>>>>>>>> Bailing b/c workers were just created and are not ready yet');
    return;
  }

  // Send work to available workers.
  var inactiveWorkers = this._getInactiveWorkers();

  console.log('inactive:', inactiveWorkers.length);
  inactiveWorkers.forEach(function(worker) {
    if (this._pendingFiles.length > 0) {
      worker.isActive = true;
      console.log('Sending work now!', worker.pid);
      self._sendMessage(worker, 'run', this._pendingFiles.shift());
    }
  }, this);

  // We have already digested all pending work, send the terminal event.
  if (this._workers.length === inactiveWorkers.length && this._pendingFiles.length === 0) {
    this.emit('end');

    // Anyone that's still inactive should be dropped.
    inactiveWorkers.forEach(function(worker) {
      worker.kill();
    });
  }
};

module.exports = ClusterRunner;

