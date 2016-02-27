
module.exports = function(channel, context) {

  channel.on('message', function(message) {
    console.log('MESSAGE HANDLER!', message);

    var handler = context['on_' + message.type];
    if (!handler) {
      throw new Error('Unexpected message type from child: ' + message.type);
    }

    // Push the child reference onto the end of the provided args.
    message.payload.push(channel);

    handler.apply(context, message.payload);
  });

  return {
    send: function(message) {
      return channel.send(message);
    }
  };
};

