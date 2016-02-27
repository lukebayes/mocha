
# mocha/cluster
Instead of the historical increases in individual CPU core performance,
manufacturers are now delivering an increasing number of cores. As node is a
single-threaded runtime, we have seen raw performance stagnate for the past 3-5
years.

During this time, many JavaScript developers have discovered the value in
writing automated tests. Some organizations are generating many thousands of
unit, component and even integration tests that run on top of Mocha.

If these tests are overwhelmingly  atomic and do not require shared state, we
should see enormous runtime performance benefits by executing these tests in
parallel.

Some quick explorations on a 2013 quad-core iMac have shown that a 2 minute
test run that includes about 5,500 unit tests can be executed in under 30
seconds. This spike involved simply spreading the total test file count
by the number of cores and executing them. 3 of the 4 cores typically
complete in 15 seconds, while the remaining core seems to receive more of
the slow tests and takes the remaining 15 seconds. Because of this, it is
my position that these run times can be brought down even further with some
improvements in execution strategy.

## Observation: Slow test causes
There are a couple reasons why tests might take a long time:

* CPU bound: Some tests spend most of the time with the CPU pegged.
* Async/timer bound: Some tests spend most of the time idle waiting for
    timers to expire.

Both of these kinds of slow tests will benefit mightily from spreading work
across multiple CPU cores, but depending on which type of slow tests are more
prevalent, different strategies will impact overall runtime differently.

For example, if our tests are slow because of idle time, we could bring up
many more runners than available cores and would see performance improvements.

On the other hand, if our tests are slow because of CPU usage, this strategy
would slow down execution at some point because of swapping costs.

## Assertion: Very few tests should be idle
Slow tests should be slow because of computation, not idle timeouts.

Most tests that are slow and mostly idle should be reworked so that the entity
under test is provided with a configuration that cuts down on idle time.

We use wrapped versions of all async timers and provide these fakes to our
entities in the test environment. These fakes help us run async tests
synchronously while still surfacing and exhibiting async scheduling behaviors.


## Observation: Reporting
Some reporters assume that all tests are executed serially. For example, the
BDD reporter will print a suite header followed by newlines where each test
output is collected as it is received and they are indented based on the
current suite context.


## Conclusions
If very few tests are idle, then many of our slow tests are slow because of
excessive CPU usage.


# Strategy
The primary entry point will process commandline arguments and build up an
outer SuiteProxy. This SuiteProxy will be responsible for connecting the event
stream emitted by external runners with a given printer. This orchestration
is somewhat complicated by the fact that many printers assume tests are being
executed serially.

The SuiteProxy will determine which core is currently acting as the leader and
will forward that event stream to the current reporter and buffer each
remaining core's events. When the leader finishes with a suite, the next test
file will be provided for execution and the next core will be assigned the
leadership role and any buffered events for that core will be flushed. The next
test file will be provided to the now idle core.

* Fire up an execution ClusterClient for each requested core.
* Connect a ClusterManager to each instantiated client.


## ClusterRunner
* Create and manage ClusterClients

## ClusterWorker
* Receive configuration and 

## ClusterEventBuffer
* Buffer and otherwise transform event stream for reporters


## Protocol
* Validate options
* Build file list (without loading JavaScript)

* Build the outer (user selected) reporter

* Build the ClusterRunner and initialize it

* Instantiate a ClusterWorker for each requested core and establish handshake

* Begin flushing files (suites) to the ClusteredRunners

* Buffer reporter events for each worker and flush the event stream for leader

* Whenever a cluster worker goes idle, send it the next suite


# IMPL TODOS

* Collect --multicore argument to select maximum available core count
* Collect --multicore-count argument to manually assign core count

* Move overall suite execution to a separate process and proxy event stream


# TEST TODOS
* Add tests for multicore argument
* Add tests for multicoreCount argument
