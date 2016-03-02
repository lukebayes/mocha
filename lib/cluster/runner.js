/**
 * Module dependencies.
 */

var EventEmitter = require('events').EventEmitter;
var childProcess = require('child_process');
var inherits = require('../utils').inherits;
var messenger = require('./message_handler');
var os = require('os');

function ClusterRunner(suite, opt_options) {
  EventEmitter.call(this);

  this._pendingFiles = [];
  this._workers = [];
  this.options = opt_options || {};

  console.log('CLUSTER RUNNER ARGS:', process.argv);
};

/**
 * Inherit from `EventEmitter.prototype`.
 */
inherits(-coreClusterRunner, EventEmitter);

ClusterRunner.prototype._getDefaultCoreCount = function() {
  return os.cpus().length || 1;
};

ClusterRunner.prototype.getCoreCount = function() {
  return this.options.multicoreCount || this._getDefaultCoreCount();
};

ClusterRunner.prototype._exitIfNecessary = function() {
  if (this._pendingFiles.length === 0 && this._workers.length === 0) {
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
  var workerCount = Math.min(this._pendingFiles.length, this.getCoreCount());

  while (this._workers.length < workerCount) {
    this._createWorker();
  }
};

ClusterRunner.prototype._createWorker = function() {
  var args = process.argv.slice(2);
  var channel = childProcess.fork(__dirname + '/worker.js', args, {
    cwd: process.cwd,
    env: process.env
  });
  var worker = {
    isActive: false,
    pid: channel.pid,
    channel: channel,
    kill: channel.kill.bind(channel),
    send: messenger(channel, this)
  };

  channel.on('exit', this._createWorkerExitHandler(worker));
  channel.on('error', this._createWorkerErrorHandler(worker));

  this._workers.push(worker);

  if (!this._leadWorker) {
    this._leadWorker = worker;
  }
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
    return !worker.isActive;
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

/**
 * Receive a reporter event from a worker.
 */
ClusterRunner.prototype.onReporterEvent = function(pid, eventName, test, failure) {
  // Block start and end events.
  if (eventName === 'start') {
    return;
  }

  if (eventName === 'end') {
    return;
  }

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

/**
 * Notification that is received when a worker exits.
 *
 * In typical cases, this code will kill workers explicitly and might be able
 * to clean up more directly, but this code path is required for conditions
 * where workers exit unexpectedly.
 *
 */
ClusterRunner.prototype._createWorkerExitHandler = function(childProcess) {
  return function() {
    var workerIndex = this._getIndexByPid(childProcess.pid);
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

  this._runTestFiles(this.options.files);
};

ClusterRunner.prototype._flushWork = function() {
  this._createWorkersIfNecessary();

  // Send work to available workers.
  var inactiveWorkers = this._getInactiveWorkers();

  inactiveWorkers.forEach(function(worker) {
    if (this._pendingFiles.length > 0) {
      worker.isActive = true;
      worker.send('run', [this._pendingFiles.shift()]);
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

ClusterRunner.prototype._runTestFiles = function(files) {
  this._pendingFiles = this._pendingFiles.concat(files);

  this._flushWork();
};

module.exports = ClusterRunner;

