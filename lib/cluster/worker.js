var ClusterReporter = require('../reporters/cluster');
var Mocha = require('../mocha');
var inherits = require('../utils').inherits;
var getOptions = require('../../bin/options');
var messenger = require('./message_handler');

var LOOP_DURATION_MS = 1000;
var NULL_FUNCTION = function() {};

/**
 * Application entry point for a parallel worker.
 */
var Worker = function() {
  this._intervalId = null;
  this._isLeader = false;

  // Create an object to hold worker state and messaging gateway.
  this._channel = {
    pid: process.pid,
    send: messenger(process, this),
    isLeader: false
  };

  this._reporter = this._createReporter(this._channel);

  // DONOTSUBMIT!
  require('/home/lukebayes/Projects/krypton/experimental/common/test/bootstrap');
  require('/home/lukebayes/Projects/krypton/experimental/modules/browser/kr-react/bootstrap');

  this._mocha = new Mocha({reporter: this._reporter});
};

/**
 * We need a constructor that the original Mocha implementation can call with
 * `new`, but that also has access to our local scope messaging channel.
 */
Worker.prototype._createReporter = function(channel) {
  var WorkerReporter = function(runner, opt_options) {
    this.channel = channel;
    ClusterReporter.call(this, runner, opt_options);
  };

  inherits(WorkerReporter, ClusterReporter);

  return WorkerReporter;
};

/**
 * Run the provided test files.
 *
 * This method is called from the master process via the message handler.
 */
Worker.prototype.run = function(files) {
  var self = this;
  this._mocha.rerunWith(files, function(err) {
    if (err) {
      console.log('Worker.rerun ERROR with:', err);
    }

    self._channel.send('onWorkerComplete', self._channel.pid);
  });
};

/**
 * Set up an interval to prevent the process from exiting.
 */
Worker.prototype.listen = function() {
  this._intervalId = setInterval(NULL_FUNCTION, LOOP_DURATION_MS);
};

Worker.create = function() {
  return new Worker();
};

module.exports = Worker;

// This is the entry point for parallel workers.
if (require.main === module) {
  Worker.create();
}

