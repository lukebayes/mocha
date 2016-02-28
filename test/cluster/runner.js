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
    this.timeout(3000);

    runner = ClusterRunner.create({
      multicoreCount: 8,
      files: [
        'test/grep.js',
        'test/color.js',
        'test/suite.js',
        'test/test.js'
      ]
    });
    runner.run(done);
  });
});

