var Yez = absurd.component('Yez', {
	css: HomeCSS(),
	host: 'localhost',
	port: 9172,
	connected: false,
	tasks: {},
	beacons: {},
	defaultCWD: '',
	retry: 1,
	connect: function() {
		if(this.connected) { return; }
		var self = this;
		this.socket = io.connect('http://' + this.host + ':' + this.port, {
			'force new connection': true
		});
		this.socket.on('connect', function (data) {
			self.retry = 1;
			self.connected = true;
			self.status.setStatus(true);
			self.nav.visible(true);
			self.content.visible(true);
		});
		this.socket.on('disconnect', function() {
			self.connected = false;
			self.status.setStatus(false, self.retry);
			self.nav.visible(false);
			self.content.visible(false);
			self.connect();
		});
		this.socket.on('initial', function(data) {
			self.defaultCWD = normalizePath(data.cwd);
			// marking tasks as started
			if(data.running && data.running.length > 0) {
				for(var i=0; i<data.running.length; i++) {
					if(self.tasks[data.running[i].id]) {
						var t = self.tasks[data.running[i].id];
						t.started = true;
						t.populate();
					}
				}
				self.home.setTasks(self.tasks);
			}
			// remove the started state
			for(id in self.tasks) {
				var t = self.tasks[id];
				if(t.started) {
					var isItReally = false;
					for(var i=0; i<data.running.length; i++) {
						if(t.data.id === data.running[i].id) {
							isItReally = true;
						}
					}
					if(!isItReally) {
						console.log('no it is not');
					}
				}
			}
		});
		this.socket.on('response', function(data) {
			if(self.tasks[data.id]) {
				self.tasks[data.id].response(data);
			}
		});
		this.socket.on('beacon-response', function(data) {
			if(self.beacons[data.id]) {
				self.beacons[data.id](data);
			}
		});
		setTimeout(function() {
			if(!self.connected) {
				self.retry += 1;
				self.status.setStatus(false, self.retry);
				self.connect();
			}
		}, 5000);
		return this;
	},
	ready: function() {

		var self = this, showTask;

		if(window.localStorage) {
			var ts = window.localStorage.getItem('YezTasks');
			if(ts) {
				try {
					ts = JSON.parse(ts);
					for(var i=0; i<ts.length; i++) {
						var t = this.initializeTask(ts[i]);
						this.tasks[t.data.id] = t;
					}
				} catch(err) {
					console.log(err);
				}
			}
		}

		this.populate();

		this.status = Status(this.host, this.port);
		this.nav = Nav();
		this.content = Content();
		this.home = Home();

		this.nav.on('open-task', function(data) {
			showTask(data.id);
		});

		this.home
		.on('show-task', showTask = function(id) {
			if(self.tasks[id]) {
				var t = self.tasks[id];
				self.content.append(t);
			}
		})
		.on('run-task', function(id) {
			if(self.tasks[id]) {
				var t = self.tasks[id];
				self.content.append(t);
				t.startTasks();
			}
		})
		.on('run-task-silent', function(id) {
			if(self.tasks[id]) {
				self.tasks[id].startTasks();
				self.dispatch('tasks-updated');
			}
		})
		.on('stop-task', function(id) {
			if(self.tasks[id]) {
				var t = self.tasks[id];
				self.content.append(t);
				t.stopTasks();
			}
		})
		.on('stop-task-silent', function(id) {
			if(self.tasks[id]) {
				self.tasks[id].stopTasks();
				self.dispatch('tasks-updated');
			}
		})
		.on('new-task', function() {
			var newTask = self.initializeTask();
			self.content.append(newTask);
			newTask.goToEditMode();
		});

		this.connect().showHome();

	},
	initializeTask: function(data) {
		var self = this;
		var t = Task(data || {
			name: 'Task',
			cwd: this.defaultCWD,
			commands: [''],
			id: getId()
		});
		t.on('data', function(data) {
			delete data.target;
			if(self.socket && self.connected) {
				self.socket.emit('data', data);
			} else {
				t.response({ action: 'error', msg: 'No back-end!' });
			}
		})
		.on('save', function() {
			self.tasks[t.getId()] = t;
			self.dispatch('tasks-updated');
		})
		.on('home', this.showHome.bind(this))
		.on('delete-task', function() {
			delete self.tasks[t.data.id];
			self.dispatch('tasks-updated').showHome();
		})
		.on('ended', function() {
			self.dispatch('tasks-updated')
		});
		return t;
	},
	showHome: function() {
		this.content.append(this.home.setTasks(this.tasks));
		return this;
	},
	saveToStorage: function() {
		var tasks = [];
		for(var id in this.tasks) {
			tasks.push(this.tasks[id].data);
		}
		if(window.localStorage) {
			window.localStorage.setItem('YezTasks', JSON.stringify(tasks));
		}
		return this;
	},
	send: function(data, cb) {
		data.id = data.id || getId();
		this.beacons[data.id] = cb;
		data.target && (delete data.target);
		if(this.socket && this.connected) {
			this.socket.emit('data', data);
		} else {
			cb({ action: 'error', msg: 'No back-end!' });
		}
	},
	'tasks-updated': function() {
		this.home.setTasks(this.tasks);
		this.saveToStorage();
	}
})();

function HomeCSS() {
	return {
		'body, html': {
			wid: '100%', hei: '100%',
			mar: 0, pad: 0,
			ff: "'Roboto', 'sans-serif'",
			fz: '16px', lh: '26px'
		},
		'.left': { fl: 'l' },
		'.right': { fl: 'r' },
		'code': {
			bd: 'solid 1px #D8D8D8',
			pad: '0 2px 0 2px'
		},
		'.clear, .clearfix': {
			clear: 'both'
		},
		'.content': {
			d: 'b'
		},
		'header': {
			bg: '#F3EEE4',
			bdb: 'solid 2px #DFD2B7',
			'.logo': {
				d: 'b', fl: 'l',
				mar: '0 4px 0 10px',
				opacity: 0.5
			},
			'&:after': {
				d: 'tb',
				content: '" "',
				clear: 'both'
			}
		},
		hr: {
			bdt: 'none', bdb: 'dotted 1px #999',
			mar: '0 10px'
		}
	}
}