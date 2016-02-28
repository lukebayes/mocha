var childProcess = require('child_process');
var messenger = require('./message_handler');
var os = require('os');

function Runner(opt_options) {
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

Runner.prototype._exitIfNecessary = function() {
  if (this._pendingFiles.length === 0 && this._workers.length === 0) {
    console.log('NO MORE FILES, EXIT RUNNER NOW!!!!!!!!!!!!!!!!!!!!!!!!!!!');
    this._onComplete && this._onComplete();
  }
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
  var workerCount = Math.min(this._pendingFiles.length, this.getCoreCount());

  while (this._workers.length < workerCount) {
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

Runner.prototype._getIndexByPid = function(pid) {
  return this._workers.findIndex(function(entry) {
    return entry.pid === pid;
  });
};

Runner.prototype._getWorkerByPid = function(pid) {
  return this._workers.find(function(entry) {
    return entry.pid === pid;
  });
};

Runner.prototype._getInactiveWorkers = function() {
  return this._workers.filter(function(worker) {
    return !worker.isActive;
  });
};

// Begin worker message handlers

Runner.prototype.onWorkerReady = function(pid, worker) {
  console.log('onWorkerReady with:', pid, !!worker);
};

Runner.prototype.onWorkerStart = function(pid) {
  console.log('onWorkerStart with:', pid);
};

Runner.prototype.onWorkerPass = function(pid, test) {
  console.log('ON WORKER PASS: ', test.title);
};

Runner.prototype.onWorkerFail = function(pid, test, failure) {
  console.log('ON WORKER FAIL: ', test.file);
  console.error(failure.stack);
};

Runner.prototype.onWorkerEnd = function(pid, test) {
  console.log('ON WORKER END');
  this._getWorkerByPid(pid).isActive = false;

  this._flushWork();
};

Runner.prototype.onWorkerPending = function(pid, test) {
  console.log('ON WORKER PENDING');
};

/**
 * Notification that is received when a worker exits.
 *
 * In typical cases, this code will kill workers explicitly and might be able
 * to clean up more directly, but this code path is required for conditions
 * where workers exit unexpectedly.
 *
 */
Runner.prototype._createWorkerExitHandler = function(childProcess) {
  return function() {
    console.log('runner received childProcess EXIT', childProcess.pid);
    var workerIndex = this._getIndexByPid(childProcess.pid);
    if (workerIndex > -1) {
      console.log('FOUND WORKER, removing now!');
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
Runner.prototype.run = function(opt_onComplete) {
  console.log('RUN NOW! ', this.getCoreCount());

  this._onComplete = opt_onComplete;

  // TODO(lbayes): Use the file selection code from _mocha.js?
  this._runTestFiles(this.options.files);
};

Runner.prototype._flushWork = function() {
  this._createWorkersIfNecessary();

  this._getInactiveWorkers().forEach(function(worker) {
    if (this._pendingFiles.length > 0) {
      console.log('SENDING WORK TO PID:', worker.pid);
      worker.isActive = true;
      worker.send('run', [this._pendingFiles.shift()]);
    } else {
      console.log('KILLING WORKER b/c:', this._pendingFiles.length, 'vs',
        this._workers.length);
      worker.kill();
    }
  }, this);
};

Runner.prototype._runTestFiles = function(files) {
  console.log('RUN FILES WITH:', files);
  this._pendingFiles = this._pendingFiles.concat(files);

  this._flushWork();
};

Runner.create = function(opt_options) {
  return new Runner(opt_options);
};

module.exports = Runner;

