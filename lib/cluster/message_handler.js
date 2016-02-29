/**
 * Configure a message channel and receiver to handle structured messages
 * by calling specific functions with message types.
 */
module.exports = function(channel, receiver) {

  channel.on('message', function(message) {
    var handler = receiver[message.method];

    // Throw if the expected handler is not defined.
    if (!handler) {
      throw new Error('Unexpected message method from child: ' + message.method);
    }

    // Call the method on the receiver with the provided args & possibly the
    // channel reference.
    handler.apply(receiver, message.args);
  });

  // TODO(lbayes): Create a real wrapper (or subclass?) for the Channel/process entities.
  return function(method, var_args) {
    var args = Array.prototype.slice.call(arguments, 1);
    if (channel.connected) {
      return channel.send({method: method, args: args});
    }
  };
};

