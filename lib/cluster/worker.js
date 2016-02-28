var ClusterReporter = require('../reporters/cluster');
var Mocha = require('../mocha');
var inherits = require('../utils').inherits;
var messenger = require('./message_handler');


// DONOTSUBMIT(lbayes)
// TODO(lbayes): Figure out how to run _mocha to load mocha.opts in workers
var should = require('should');


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

  this._mocha = new Mocha({
    reporter: this._reporter
  });

  console.log('Worker instantiated with:', this._channel.pid);
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

Worker.prototype.run = function(files) {
  console.log('-------------------------------------');
  console.log('WORKER.RUN WITH:', files);
  var self = this;
  console.log(this._channel.pid, 'Worker run called with:', files);
  this._mocha.rerunWith(files, function() {
    console.log('WORKER MOCHA RUN COMPLETE!');
    //self._channel.send('runComplete', this._channel.pid);
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

