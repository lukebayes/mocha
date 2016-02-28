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

    // Push the child reference onto the end of the provided args if the
    // handler is likely defined to expect this parameter.
    if (handler.length > message.args.length) {
      message.args.push(channel);
    }

    // Call the method on the receiver with the provided args & possibly the
    // channel reference.
    handler.apply(receiver, message.args);
  });

  // TODO(lbayes): Create a real wrapper (or subclass?) for the Channel/process entities.
  return function(method, var_args) {
    var args = Array.prototype.slice.call(arguments, 1);
    return channel.send({method: method, args: args});
  };
};

