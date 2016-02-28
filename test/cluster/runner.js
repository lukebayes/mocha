var ClusterRunner = require('../../lib/cluster/runner');
var assert = require('assert');
var os = require('os');

describe('ClusterRunner', function() {
  var runner;

  it('is instantiable', function() {
    runner = ClusterRunner.create();
    assert(runner);
  });

  it('does not allow new', function() {
    assert.throws(function() {
      new ClusterRunner();
    }, /only be instantiated/);
  });

  it('uses default core count', function() {
    runner = ClusterRunner.create();
    assert.equal(runner.getCoreCount(), os.cpus().length);
  });

  it('accepts multiple cores', function() {
    runner = ClusterRunner.create({multicoreCount: 5});
    assert.equal(runner.getCoreCount(), 5);
  });

  it.only('starts a worker for each core', function(done) {
    runner = ClusterRunner.create({
      multicoreCount: 1,
      files: [
        'test/color.js',
        'test/grep.js',
        'test/suite.js',
        'test/test.js',
        'test/utils.js'
      ]
    });
    runner.run(done);
  });
});

