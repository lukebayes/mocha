/**
 * Module dependencies.
 */

var Base = require('./base');
var inherits = require('../utils').inherits;

/**
 * Expose `Cluster`.
 */

exports = module.exports = Cluster;

/**
 * Initialize a new test reporter for multicore workers
 *
 * @api public
 * @param {Runner} runner
 */
function Cluster(runner, options) {
  Base.call(this, runner);

  console.log('CLUSTER REPORTER INSTANTIATED with:', options);
  var self = this;

  runner.on('start', function() {
    console.log(process.pid, 'start');
  });

  runner.on('pending', function() {
    console.log(process.pid, 'pending');
  });

  runner.on('pass', function(test) {
    console.log(process.pid, 'pass');
  });

  runner.on('fail', function() {
    console.log(process.pid, 'fail');
  });

  runner.on('end', function() {
    console.log(process.pid, 'end');
  });
};

/**
 * Inherit from `Base.prototype`.
 */
inherits(Cluster, Base);

