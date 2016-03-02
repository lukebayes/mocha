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
  console.log(process.pid, 'Cluster REPORTER created');

  var self = this;
  var send = this._getSender();

  /*
  // Cluster workers should not send start/end events to the reporter.
  runner.on('start', function() {
    send('start');
  });

  runner.on('end', function() {
    send('end');
  });

  // Hook events should not be sent to the cluster runner b/c these
  // are only used for execution.
  runner.on('hook', function(hook) {
    //send('hook', self._serializeHook(hook));
  });

  runner.on('hook end', function(hook) {
    //send('hook end', self._serializeHook(hook));
  });
  */

  runner.on('suite', function(suite) {
    send('suite', null, self._serializeSuite(suite));
  });

  runner.on('suite end', function(suite) {
    send('suite end', null, self._serializeSuite(suite));
  });

  runner.on('test', function(test) {
    send('test', self._serializeTest(test));
  });

  runner.on('test end', function(test) {
    send('test end', self._serializeTest(test));
  });

  runner.on('pass', function(test) {
    // Send a more serializable test object over the wire that does not include
    // transitive references to expensive or large objects (like parent and context).
    send('pass', self._serializeTest(test));
  });

  runner.on('fail', function(test, error) {
    send('fail', self._serializeTest(test), null, {
      message: error.message,
      stack: error.stack
    });
  });

  runner.on('pending', function(test) {
    send('pending', self._serializeTest(test));
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

Cluster.prototype._getSender = function() {
  return function(eventName, opt_test, opt_suite, opt_error) {
    // console.log(process.pid, eventName, !!opt_test, !!opt_suite, opt_error);
    return process.send({
      type: 'reporter-event',
      eventName: eventName,
      test: opt_test,
      suite: opt_suite,
      error: opt_error
    });
  };
};

