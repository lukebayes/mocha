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
 *
 * Events that should be proxied:
 *
 *   - `start`  execution started
 *   - `end`  execution complete
 *   - `suite`  (suite) test suite execution started
 *   - `suite end`  (suite) all tests (and sub-suites) have finished
 *   - `test`  (test) test execution started
 *   - `test end`  (test) test completed
 *   - `hook`  (hook) hook execution started
 *   - `hook end`  (hook) hook complete
 *   - `pass`  (test) test passed
 *   - `fail`  (test, err) test failed
 *   - `pending`  (test) test pending
 * @api public
 * @param {Runner} runner
 */
function Cluster(runner, options) {
  Base.call(this, runner);

  var self = this;
  var channel = this._getChannel();

  runner.on('start', function() {
    channel.send('onReporterEvent', channel.pid, 'start');
  });

  runner.on('end', function() {
    channel.send('onReporterEvent', channel.pid, 'end');
  });

  runner.on('suite', function(suite) {
    channel.send('onReporterEvent', channel.pid, 'suite', self._serializeSuite(suite));
  });

  runner.on('suite end', function(suite) {
    channel.send('onReporterEvent', channel.pid, 'suite end', self._serializeSuite(suite));
  });

  runner.on('test', function(test) {
    channel.send('onReporterEvent', channel.pid, 'test', self._serializeTest(test));
  });

  runner.on('test end', function(test) {
    channel.send('onReporterEvent', channel.pid, 'test end', self._serializeTest(test));
  });

  runner.on('hook', function(hook) {
    //channel.send('onReporterEvent', channel.pid, 'hook', self._serializeHook(hook));
  });

  runner.on('hook end', function(hook) {
    //channel.send('onReporterEvent', channel.pid, 'hook end', self._serializeHook(hook));
  });

  runner.on('pass', function(test) {
    // Send a more serializable test object over the wire that does not include
    // transitive references to expensive or large objects (like parent and context).
    channel.send('onReporterEvent', channel.pid, 'pass', self._serializeTest(test));
  });

  runner.on('fail', function(test, error) {
    channel.send('onReporterEvent', channel.pid, 'fail', self._serializeTest(test), {
      message: error.message,
      stack: error.stack
    });
  });

  runner.on('pending', function(test) {
    channel.send('onReporterEvent', channel.pid, 'pending', self._serializeTest(test));
  });
};

Cluster.prototype._serializeSuite = function(suite) {
  return {
    delayed: suite.delayed,
    file: suite.file,
    //parent: suite.parent.title,
    //pending: suite.pending,
    tests: suite.tests.map(function(test) { return {title: test.title}; }),
    title: suite.title
  };
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

