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

  var self = this;
  var channel = this._getChannel();

  runner.on('start', function() {
    channel.send('onWorkerStart', channel.pid);
  });

  runner.on('pending', function(test) {
    channel.send('onWorkerPending', channel.pid, self._serializeTest(test));
  });

  runner.on('pass', function(test) {
    // Send a more serializable test object over the wire that does not include
    // transitive references to expensive or large objects (like parent and context).
    channel.send('onWorkerPass', channel.pid, self._serializeTest(test));
  });

  runner.on('fail', function(test, error) {
    channel.send('onWorkerFail', channel.pid, self._serializeTest(test), {
      message: error.message,
      stack: error.stack
    });
  });

  runner.on('end', function() {
    console.log(channel.pid, 'end');
    channel.send('onWorkerEnd', channel.pid);
  });
};

Cluster.prototype._serializeTest = function(test) {
  return {
    title: test.title,
    body: test.body,
    async: test.async,
    sync: test.sync,
    timedOut: test.timedOut,
    pending: test.pending,
    type: test.type,
    file: test.file,
    timer: test.timer,
    duration: test.duration,
    state: test.state,
    speed: test.speed
  };
};

Cluster.prototype._getChannel = function() {
  if (!this.channel) {
    throw new Error('Cluster reporter must be provided with a `.channel`');
  }
  return this.channel;
};

/**
 * Inherit from `Base.prototype`.
 */
inherits(Cluster, Base);


/*
delegateEvent(runner, channel, 'start');
delegateEvent(runner, channel, 'pass', function(test) {
  return {
  };
});
*/

