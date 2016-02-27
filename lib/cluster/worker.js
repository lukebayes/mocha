var messenger = require('./message_handler');

var Worker = function() {
  this._pid = process.pid;
  console.log('Worker instantiated with:', this._pid);

  this._messenger = messenger(process, this);
  this._messenger.send({type: 'created', payload: [this._pid]});
};

Worker.prototype.on_run = function(file) {
  console.log(this._pid, 'Worker run called with:', file);
};

Worker.create = function() {
  return new Worker();
};

module.exports = Worker;

if (require.main === module) {
  console.log('Worker is main');
  Worker.create();
}

