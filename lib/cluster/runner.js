var childProcess = require('child_process');
var messenger = require('./message_handler');
var os = require('os');

var KEY = {};

var Runner = function(key, opt_options) {
  if (key !== KEY) {
    throw new Error('ClusterRunner should only be instantiated with the create() factory method');
  }

  this.options = opt_options || {};

  this._workers = [];
};

Runner.prototype._getDefaultCoreCount = function() {
  return os.cpus().length || 1;
};

Runner.prototype.getCoreCount = function() {
  return this.options.multicoreCount || this._getDefaultCoreCount();
};

Runner.prototype._getOnChildExit = function(child) {
  return function() {
    console.log('CHILD EXIT');
    var childIndex = this._workers.indexOf(child);
    if (childIndex > -1) {
      this._workers.splice(childIndex, 1);
    }

    if (this._workers.length === 0) {
      this._onComplete && this._onComplete();
    }
  }.bind(this);
};

Runner.prototype._createWorker = function() {
  var that = this;

  var child = childProcess.fork(__dirname + '/worker.js');
  console.log('CREATING WORKER!', child.pid);

  child.on('exit', this._getOnChildExit(child));
  child.on('error', function(err) {
    console.error('CHILD ERR:', child.pid, err);
  });

  messenger(child, this);

  this._workers.push(child);

  if (!this._leadWorker) {
    this._leadWorker = child;
  }
};

// Begin child message handlers

Runner.prototype.on_created = function(pid, child) {
  console.log('ON CHILD CREATED WITH:', pid, !!child);
  //child.kill();
};

// End child message handlers

Runner.prototype.run = function(onComplete) {
  console.log('RUN NOW! ', this.getCoreCount());

  this._onComplete = onComplete;

  for (var i = 0, len = this.getCoreCount(); i < len; i++) {
    this._createWorker();
  }
};

Runner.prototype.runFiles = function(files) {
};

Runner.create = function(opt_options) {
  var instance = new Runner(KEY, opt_options);
  return instance;
};

module.exports = Runner;

// DONOTSUBMIT <- The following is for development only.
// if (require.main === module) {
  // Runner.create();
// }
