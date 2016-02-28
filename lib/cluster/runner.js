var childProcess = require('child_process');
var messenger = require('./message_handler');
var os = require('os');

var KEY = {};

function Runner(key, opt_options) {
  if (key !== KEY) {
    throw new Error('ClusterRunner should only be instantiated with the create() factory method');
  }

  this.options = opt_options || {};

  this._pendingFiles = [];
  this._workers = [];
};

Runner.prototype._getDefaultCoreCount = function() {
  return os.cpus().length || 1;
};

Runner.prototype.getCoreCount = function() {
  return this.options.multicoreCount || this._getDefaultCoreCount();
};

/**
 * Notification that is received when a worker exits.
 *
 * In typical cases, this code will kill workers explicitly and might be able
 * to clean up more directly, but this code path is required for conditions
 * where workers exit unexpectedly.
 *
 */
Runner.prototype._createWorkerExitHandler = function(worker) {
  return function() {
    console.log('runner received worker EXIT');
    var workerIndex = this._workers.indexOf(worker);
    if (workerIndex > -1) {
      this._workers.splice(workerIndex, 1);
    }

    if (this._workers.length === 0) {
      this._onComplete && this._onComplete();
    }
  }.bind(this);
};

Runner.prototype._createWorkerErrorHandler = function(worker) {
  return function(err) {
    console.error('WORKER [' + worker.pid + '] ERROR:');
    console.error(err.stack);
  }.bind(this);
};

/**
 * Ensure we have the expected number of workers currently active.
 */
Runner.prototype._createWorkersIfNecessary = function() {
  var coreCount = this.getCoreCount();

  while (this._workers.length < coreCount) {
    this._createWorker();
  }
};

Runner.prototype._createWorker = function() {
  var channel = childProcess.fork(__dirname + '/worker.js');
  console.log('CREATING WORKER!', channel.pid);


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

// Begin worker message handlers

Runner.prototype.onWorkerReady = function(pid, worker) {
  console.log('onWorkerReady with:', pid, !!worker);
};

// End worker message handlers

/**
 * Run the tests using the configuration that was provided to the constructor
 * and call the optionally provided onComplete handler when all tests have
 * finished.
 */
Runner.prototype.run = function(opt_onComplete) {
  console.log('RUN NOW! ', this.getCoreCount());

  this._onComplete = opt_onComplete;

  // TODO(lbayes): Use the file selection code from _mocha.js?
  this._runTestFiles(this.options.files);

  this._fakeExit();
};

// DONOTSUBMIT(lbayes): Just for development.
Runner.prototype._fakeExit = function() {
  setTimeout(function() {
    for (var i = 0, len = this._workers.length; i < len; i++) {
      this._workers[i].kill();
    }
  }.bind(this), 100);
};

Runner.prototype._workerIsActive = function(worker) {

};

Runner.prototype._fillWorkerPool = function() {
  this._createWorkersIfNecessary();
  this._workers.forEach(function(worker) {
    console.log('FILL UP:', worker.pid);
    if (!worker.isActive) {
      worker.send('run', [this._pendingFiles.shift()]);
    }
  }, this);
};

Runner.prototype._runTestFiles = function(files) {
  console.log('RUN FILES WITH:', files);
  this._pendingFiles = this._pendingFiles.concat(files);

  this._fillWorkerPool();
};

Runner.create = function(opt_options) {
  var instance = new Runner(KEY, opt_options);
  return instance;
};

module.exports = Runner;

