/**
 * Module dependencies.
 */

var BaseRunner = require('../runner');
var EventEmitter = require('events').EventEmitter;
var childProcess = require('child_process');
var inherits = require('../utils').inherits;
var os = require('os');
var path = require('path');


// DELETEME
var testCount = 0;

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
  // console.log('CLUSTER RUNNER ARGS:', process.argv);
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
    // Add the test object methods to the serialized test data.
    this._mixIntoTest(payload.test);
  }

  if (payload.eventName === 'test') {
    testCount++;
  }

  this.emit(payload.eventName, payload.test || payload.suite || payload.hook, payload.error);
};

ClusterRunner.prototype._createMessageHandler = function(worker) {
  var self = this;
  return function(payload) {
    switch (payload.type) {
      case 'worker-ready':
        worker.isBusy = false;
        self._flushWork();
        break;
      case 'reporter-event':
        try {
          self._onReporterEvent(worker, payload);
        } catch (err) {
          console.log('UNHANDLED WORKER ERROR:', err.stack);
        }
        break;
      default:
        console.log('---------------------');
        console.log('>> UNHANDLED worker message handler with:', worker.pid, arguments);
    }
  };
};

ClusterRunner.prototype._getWorkerArgs = function() {
  if (!this._workerArgs) {
    var blacklistedFlags = ['--multicore', '--multicore-count', '--reporter', '--growl'];
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
  worker.isBusy = false;

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

ClusterRunner.prototype._getFreeWorkers = function() {
  return this._workers.filter(function(worker) {
    return !worker.isBusy;
  });
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

  this._createWorkersIfNecessary();

  // Wait for workers to become ready
  //this._flushWork();
};

ClusterRunner.prototype._sendMessage = function(worker, message, payload) {
  try {
    // console.log('SENDING MSG:', message, 'to', worker.pid, 'connected?', worker.connected, 'with:', payload);
    if (!worker.send({type: message, payload: payload})) {
      console.error('FAILED TO SEND:', message, payload);
    }
  } catch (err) {
    console.log('WORKER SEND FAILURE:', err);
    throw err;
  }
};

ClusterRunner.prototype._flushWork = function() {
  var self = this;

  // Send work to available workers.
  var freeWorkers = this._getFreeWorkers();

  freeWorkers.forEach(function(worker) {
    if (this._pendingFiles.length > 0) {
      worker.isBusy = true;
      self._sendMessage(worker, 'run', this._pendingFiles.shift());
    }
  }, this);

  // See if there are still free workers.
  freeWorkers = this._getFreeWorkers();
  // We have already digested all pending work, send the terminal event.
  if (this._workers.length === freeWorkers.length && this._pendingFiles.length === 0) {
    console.log('BEFORE END!');
    this.emit('end');
    console.log('AFTER END!');
    // Anyone that's still inactive should be dropped.
    freeWorkers.forEach(function(worker) {
      console.log('KILL:', worker.pid);
      worker.kill();
    });
  }
};

module.exports = ClusterRunner;

