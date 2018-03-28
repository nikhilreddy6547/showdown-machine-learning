from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from pprint import pprint
import random
from time import time

app = Flask(__name__)
CORS(app)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:////tmp/test.db'
db = SQLAlchemy(app)

class Bot(db.Model):
	id = db.Column(db.Integer, primary_key=True)
	name = db.Column(db.String(10), unique=True, nullable=False)
	timestamp = db.Column(db.Integer, nullable=False)

	def __repr__(self):
		return '<{}: {}>'.format(self.name, self.timestamp)


@app.route('/', methods=['POST'])
def hello_world():
	data = request.json
	pprint(data)
	if ('name' in data):#update bot's timestamp to change its activity status
		bot = Bot.query.filter_by(name=data['name']).first()
		db.session.delete(bot)
		db.session.commit()
		db.session.add(Bot(name=data['name'], timestamp=int(time())))
		db.session.commit()
	if('won' in data):#game has ended
		pass#process results and such
	if ('new' not in data):
		#process data into an acceptable format, then feed it into the NN, then unprocess the output
		#storage all inputs into a database
		return jsonify(
			moves=[.1,.1,.1,.1],
			zmoves=[.1,.1,.1,.1],
			switch=[.1,.1,.1,.1,.1,.1],
			mega=.5,
		)
	if (data['new'] == 1):#bot is requesting a name
		bot_name = ""
		possible = "abcdefghijklmnopqrstuvwxyz0123456789"
		for i in range(10):
			bot_name += random.choice(possible)
		newBot = Bot(name=bot_name, timestamp=int(time()))
		db.session.add(newBot)
		db.session.commit()
		return jsonify(
			name=bot_name,
		)
	else:#bot is requesting the names of other bots
		#call database and return the ones that are still active
		users = Bot.query.all()
		pprint(users)
		activeUsers = []
		currentTime = int(time())
		for i in users:
			if (i.name == data['name']):
				continue
			elif (currentTime - i.timestamp > 300):
				db.session.delete(i)
			else:
				activeUsers.append(i.name)
		db.session.commit()
		return jsonify(
			names=activeUsers,
		)

