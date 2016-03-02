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
 * Initialize a new test printer for multicore workers that sends the event
 * stream over the process message channel.
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
    channel.send('start');
  });

  runner.on('end', function() {
    channel.send('end');
  });

  runner.on('suite', function(suite) {
    channel.send('suite', self._serializeSuite(suite));
  });

  runner.on('suite end', function(suite) {
    channel.send('suite end', self._serializeSuite(suite));
  });

  runner.on('test', function(test) {
    channel.send('test', self._serializeTest(test));
  });

  runner.on('test end', function(test) {
    channel.send('test end', self._serializeTest(test));
  });

  runner.on('hook', function(hook) {
    //channel.send('hook', self._serializeHook(hook));
  });

  runner.on('hook end', function(hook) {
    //channel.send('hook end', self._serializeHook(hook));
  });

  runner.on('pass', function(test) {
    // Send a more serializable test object over the wire that does not include
    // transitive references to expensive or large objects (like parent and context).
    channel.send('pass', self._serializeTest(test));
  });

  runner.on('fail', function(test, error) {
    channel.send('fail', self._serializeTest(test), {
      message: error.message,
      stack: error.stack
    });
  });

  runner.on('pending', function(test) {
    channel.send('pending', self._serializeTest(test));
  });
};

/**
 * Inherit from `Base.prototype`.
 */
inherits(Cluster, Base);

Cluster.prototype._serializeSuite = function(suite) {
  return {
    delayed: suite.delayed,
    file: suite.file,
    //parent: suite.parent.title,
    //pending: suite.pending,
    tests: suite.tests.map(function(test) { return {title: test.title}; }),
    // TODO(lbayes): Expand the full title too!
    title: suite.title
  };
};

Cluster.prototype._serializeTest = function(test) {
  return {
    _allowedGlobals: test._allowedGlobals,
    _fullTitle: test.fullTitle(),
    async: test.async,
    asyncOnly: test.asyncOnly,
    body: test.body,
    duration: test.duration,
    file: test.file,
    pending: test.pending,
    speed: test.speed,
    state: test.state,
    sync: test.sync,
    timedOut: test.timedOut,
    timer: test.timer,
    title: test.title,
    type: test.type
  };
};

Cluster.prototype._getChannel = function() {
  return {
    send: function(type, testOrSuite, error) {
      console.log(process.pid, type, 'testOrSuite:', !!testOrSuite, 'err:', !!error);
    }
  };
};

