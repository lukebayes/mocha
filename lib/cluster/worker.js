var ClusterReporter = require('../reporters/cluster');
var Mocha = require('../mocha');
var inherits = require('../utils').inherits;
var messenger = require('./message_handler');

var LOOP_DURATION_MS = 10;

/**
 * Application entry point for a parallel worker.
 */
var Worker = function() {
  this._pid = process.pid;
  console.log('Worker instantiated with:', this._pid);

  this._intervalId = null;
  this._send = messenger(process, this);

  this._reporter = this._createReporter();

  this._mocha = new Mocha({
    reporter: this._reporter
  });

  this._send('onWorkerReady', this._pid);
};

/**
 * We need a constructor that the original Mocha implementation can call with
 * `new`, but that also has access to our local scope messaging channel.
 */
Worker.prototype._createReporter = function() {
  var WorkerReporter = function(runner, opt_options) {
    ClusterReporter.call(this, runner, opt_options);
  };

  inherits(WorkerReporter, ClusterReporter);

  return WorkerReporter;
};

Worker.prototype.run = function(files) {
  console.log('WORKER.RUN WITH:', files);
  var self = this;
  console.log(this._pid, 'Worker run called with:', files);
  this._mocha.files = files;
  this._mocha.run(function() {
    console.log('WORKER MOCHA RUN COMPLETE!');
    //self._send('runComplete');
  });
};

/**
 * Set up an interval to prevent the process from exiting.
 */
Worker.prototype.listen = function() {
  this._intervalId = setInterval(function() {}, LOOP_DURATION_MS);
};

Worker.create = function() {
  return new Worker();
};

module.exports = Worker;

// This is the entry point for parallel workers.
if (require.main === module) {
  Worker.create();
}

