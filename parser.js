//AI code
//Work in Progress
//need to do: Fix bug in which game fails to start when bot is first initialized, checking who is active, hit the timer ffs
//supporting the server myself


/*Copyright (c) 2011-2017 Guangcong Luo and other contributors
http://pokemonshowdown.com/

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.*/

'use strict';
app.__proto__.receive = function (data) {
    var roomid = '';
    var autojoined = false;
    if (data.charAt(0) === '>') {
        var nlIndex = data.indexOf('\n');
        if (nlIndex < 0) return;
        roomid = toRoomid(data.substr(1, nlIndex - 1));
        data = data.substr(nlIndex + 1);
    }
    if (data.substr(0, 6) === '|init|') {
        if (!roomid) roomid = 'lobby';
        var roomType = data.substr(6);
        var roomTypeLFIndex = roomType.indexOf('\n');
        let i = roomType.indexOf('|title|');
        let rest = roomType.substr(i + 7);
        i = rest.indexOf(' vs. ');
        let p1 = rest.substr(0, i);
        if (p1 === bot_name) {
            rest = rest.substr(i + 5);
            i = rest.indexOf('\n');
            p1 = rest.substr(0, i);
        }
        console.warn("I think my opponent is " + p1);
        if (roomTypeLFIndex >= 0) {
            roomType = roomType.substr(0, roomTypeLFIndex);
        }
        roomType = toId(roomType);
        if (this.rooms[roomid] || roomid === 'staff' || roomid === 'upperstaff') {
            // autojoin rooms are joined in background
            this.addRoom(roomid, roomType, true);
        } else {
            this.joinRoom(roomid, roomType, true, p1);
        }
        if (roomType === 'chat') autojoined = true;
    } else if ((data + '|').substr(0, 8) === '|expire|') {
        var room = this.rooms[roomid];
        if (room) {
            room.expired = (data.substr(8) || true);
            if (room.updateUser) room.updateUser();
        }
        return;
    } else if ((data + '|').substr(0, 8) === '|deinit|' || (data + '|').substr(0, 8) === '|noinit|') {
        if (!roomid) roomid = 'lobby';

        if (this.rooms[roomid] && this.rooms[roomid].expired) {
            // expired rooms aren't closed when left
            return;
        }

        var isdeinit = (data.charAt(1) === 'd');
        data = data.substr(8);
        var pipeIndex = data.indexOf('|');
        var errormessage;
        if (pipeIndex >= 0) {
            errormessage = data.substr(pipeIndex + 1);
            data = data.substr(0, pipeIndex);
        }
        // handle error codes here
        // data is the error code
        if (data === 'namerequired') {
            var self = this;
            this.once('init:choosename', function () {
                self.send('/join ' + roomid);
            });
        } else if (data === 'rename') {
            this.renameRoom(roomid, errormessage);
        } else if (data !== 'namepending') {
            if (isdeinit) { // deinit
                if (this.rooms[roomid] && this.rooms[roomid].type === 'chat') {
                    this.removeRoom(roomid, true);
                    this.updateAutojoin();
                } else {
                    this.removeRoom(roomid, true);
                }
            } else { // noinit
                this.unjoinRoom(roomid);
                if (roomid === 'lobby') this.joinRoom('rooms');
            }
            if (errormessage) {
                if (data === 'nonexistent' && Config.server.id && roomid.slice(0, 7) === 'battle-') {
                    var replayid = roomid.slice(7);
                    if (Config.server.id !== 'showdown') replayid = Config.server.id + '-' + replayid;
                    var replayLink = 'http://replay.pokemonshowdown.com/' + replayid;
                    errormessage += '\n\nYou might want to try the replay: ' + replayLink;
                }
                this.addPopupMessage(errormessage);
            }
        }
        return;
    } else if (data.substr(0, 3) === '|N|') {
        var names = data.substr(1).split('|');
        if (app.ignore[toUserid(names[2])]) {
            app.ignore[toUserid(names[1])] = 1;
        }
    }
    if (roomid) {
        if (this.rooms[roomid]) {
            this.rooms[roomid].receive(data, roomid);
        }
        if (autojoined) this.updateAutojoin();
        return;
    }

    // Since roomid is blank, it could be either a global message or
    // a lobby message. (For bandwidth reasons, lobby messages can
    // have blank roomids.)

    // If it starts with a messagetype in the global messagetype
    // list, we'll assume global; otherwise, we'll assume lobby.

    var parts;
    if (data.charAt(0) === '|') {
        parts = data.substr(1).split('|');
    } else {
        parts = [];
    }

    switch (parts[0]) {
    case 'customgroups':
        var nlIndex = data.indexOf('\n');
        if (nlIndex > 0) {
            this.receive(data.substr(nlIndex + 1));
        }

        var tarRow = data.slice(14, nlIndex);
        this.parseGroups(tarRow);
        break;

    case 'challstr':
        if (parts[2]) {
            this.user.receiveChallstr(parts[1] + '|' + parts[2]);
        } else {
            this.user.receiveChallstr(parts[1]);
        }
        break;

    case 'formats':
        this.parseFormats(parts);
        break;

    case 'updateuser':
        var nlIndex = data.indexOf('\n');
        if (nlIndex > 0) {
            this.receive(data.substr(nlIndex + 1));
            nlIndex = parts[3].indexOf('\n');
            parts[3] = parts[3].substr(0, nlIndex);
        }
        var name = parts[1];
        var named = !!+parts[2];

        var userid = toUserid(name);
        if (userid === this.user.get('userid') && name !== this.user.get('name')) {
            $.post(app.user.getActionPHP(), {
                act: 'changeusername',
                username: name
            }, function () {}, 'text');
        }

        this.user.set({
            name: name,
            userid: userid,
            named: named,
            avatar: parts[3]
        });
        this.user.setPersistentName(named ? name : null);
        if (named) {
            this.trigger('init:choosename');
        }
        if (app.ignore[toUserid(name)]) {
            delete app.ignore[toUserid(name)];
        }
        setTimeout(function() {
            app.send('/utm |tapulele|psychiumz||psyshock,moonblast,focusblast,shadowball|Timid|,,,252,4,252||,0,,,,|||]|kartana|lifeorb||swordsdance,leafblade,sacredsword,smartstrike|Jolly|4,252,,,,252|||||]|zapdos|leftovers|H|thunderbolt,hiddenpowergrass,agility,heatwave|Modest|148,,,252,,108||,0,,,,|||]|keldeo|choicescarf||hydropump,secretsword,icywind,scald|Timid|,,,252,4,252||,0,,,,|||]|charizard|charizarditex||flareblitz,dragonclaw,dragondance,roost|Adamant|96,252,,,,160|||||]|landorustherian|assaultvest||uturn|||||||');
            findBots();
        }, 500);
        break;

    case 'nametaken':
        app.addPopup(LoginPopup, {name: parts[1] || '', error: parts[2] || ''});
        break;

    case 'queryresponse':
        var responseData = JSON.parse(data.substr(16 + parts[1].length));
        app.trigger('response:' + parts[1], responseData);
        if (parts[1] === 'userdetails') {
            challengeBot(responseData);
        }
        break;

    case 'updatechallenges':
        if (this.rooms['']) {
            this.rooms[''].updateChallenges($.parseJSON(data.substr(18)));
        }
        startGame();
        break;

    case 'updatesearch':
        if (this.rooms['']) {
            this.rooms[''].updateSearch($.parseJSON(data.substr(14)));
        }
        break;

    case 'popup':
        /*var maxWidth;
        var type = 'semimodal';
        data = data.substr(7);
        if (data.substr(0, 6) === '|wide|') {
            data = data.substr(6);
            maxWidth = 960;
        }
        if (data.substr(0, 7) === '|modal|') {
            data = data.substr(7);
            type = 'modal';
        }
        if (data.substr(0, 6) === '|html|') {
            data = data.substr(6);
            app.addPopup(Popup, {
                type: type,
                maxWidth: maxWidth,
                htmlMessage: Tools.sanitizeHTML(data)
            });
        } else {
            app.addPopup(Popup, {
                type: type,
                maxWidth: maxWidth,
                message: data.replace(/\|\|/g, '\n')
            });
        }
        if (this.rooms['']) this.rooms[''].resetPending();*/
        break;

    case 'disconnect':
        app.trigger('init:socketclosed', Tools.sanitizeHTML(data.substr(12)));
        break;

    case 'pm':
        var dataLines = data.split('\n');
        for (var i = 0; i < dataLines.length; i++) {
            parts = dataLines[i].slice(1).split('|');
            var message = parts.slice(3).join('|');
            this.rooms[''].addPM(parts[1], message, parts[2]);
            if (toUserid(parts[1]) !== app.user.get('userid')) {
                app.user.lastPM = toUserid(parts[1]);
            }
        }
        break;

    case 'roomerror':
        // deprecated; use |deinit| or |noinit|
        this.unjoinRoom(parts[1]);
        this.addPopupMessage(parts.slice(2).join('|'));
        break;

    case 'refresh':
        // refresh the page
        document.location.reload(true);
        break;

    case 'c':
    case 'chat':
        if (parts[1] === '~') {
            if (parts[2].substr(0, 6) === '/warn ') {
                app.addPopup(RulesPopup, {warning: parts[2].substr(6)});
                break;
            }
        }

    /* fall through */
    default:
        // the messagetype wasn't in our list of recognized global
        // messagetypes; so the message is presumed to be for the
        // lobby.
        if (this.rooms['lobby']) {
            this.rooms['lobby'].receive(data);
        }
        break;
    }
}
app.__proto__.joinRoom = function (id, type, nojoin, opp) {
    if (this.rooms[id]) {
        this.focusRoom(id);
        if (this.rooms[id].rejoin) this.rooms[id].rejoin();
        return this.rooms[id];
    }
    if (id.substr(0, 11) === 'battle-gen5' && !Tools.loadedSpriteData['bw']) Tools.loadSpriteData('bw');

    var room = this._addRoom(id, type, nojoin);
    this.focusRoom(id);
    if (type === "battle") {
        console.warn("WE HAVE JOINED A ROOM!");
        console.warn(opp);
        if (challenges[opp]) {
            delete challenges[opp];
        } else {
            console.warn('Accepting a challenge');
        }
        startGame();
        //more code here
    }
    return room;
}
app.__proto__.removeRoom = function (id, alreadyLeft) {
    var room = this.rooms[id];
    if (!room) return false;
    if (room === this.curRoom) this.focusRoom('');
    delete this.rooms[id];
    var index = this.roomList.indexOf(room);
    if (index >= 0) this.roomList.splice(index, 1);
    index = this.sideRoomList.indexOf(room);
    if (index >= 0) this.sideRoomList.splice(index, 1);
    room.destroy(alreadyLeft);
    if (room === this.sideRoom) {
        this.sideRoom = null;
        this.curSideRoom = null;
        this.updateSideRoom();
    }
    this.updateLayout();
    console.warn("WE HAVE LEFT A ROOM!");
    //more code here
    startGame();
    return true;
}
BattleRoom.prototype.receive = function (data, _roomid) {
    this.add(data, _roomid);
}
BattleRoom.prototype.add = function (data, _roomid) {
    if (!data) return;
    if (data.substr(0, 6) === '|init|') {
        return this.init(data);
    }
    if (data.substr(0, 9) === '|request|') {
        data = data.slice(9);

        var requestData = null;
        var choiceText = null;

        var nlIndex = data.indexOf('\n');
        if (/[0-9]/.test(data.charAt(0)) && data.charAt(1) === '|') {
            // message format:
            //   |request|CHOICEINDEX|CHOICEDATA
            //   REQUEST

            // This is backwards compatibility with old code that violates the
            // expectation that server messages can be streamed line-by-line.
            // Please do NOT EVER push protocol changes without a pull request.
            // https://github.com/Zarel/Pokemon-Showdown/commit/e3c6cbe4b91740f3edc8c31a1158b506f5786d72#commitcomment-21278523
            choiceText = '?';
            data = data.slice(2, nlIndex);
        } else if (nlIndex >= 0) {
            // message format:
            //   |request|REQUEST
            //   |sentchoice|CHOICE
            if (data.slice(nlIndex + 1, nlIndex + 13) === '|sentchoice|') {
                choiceText = data.slice(nlIndex + 13);
            }
            data = data.slice(0, nlIndex);
        }

        try {
            requestData = $.parseJSON(data);
        } catch (err) {}
        var a = this.receiveRequest(requestData, choiceText);
        console.warn("ATTEMPTING A CONNECT()");
        this.connect();
        return a;
    }

    var log = data.split('\n');
    let winner = "";
    for (var i = 0; i < log.length; i++) {
        var logLine = log[i];

        if (logLine === '|') {
            this.callbackWaiting = false;
            this.controlsShown = false;
            this.$controls.html('');
        }

        if (logLine.substr(0, 10) === '|callback|') {
            // TODO: Maybe a more sophisticated UI for this.
            // In singles, this isn't really necessary because some elements of the UI will be
            // immediately disabled. However, in doubles/triples it might not be obvious why
            // the player is being asked to make a new decision without the following messages.
            var args = logLine.substr(10).split('|');
            var pokemon = isNaN(Number(args[1])) ? this.battle.getPokemon(args[1]) : this.battle.mySide.active[args[1]];
            var requestData = this.request.active[pokemon ? pokemon.slot : 0];
            delete this.choice;
            switch (args[0]) {
            case 'trapped':
                requestData.trapped = true;
                var pokeName = pokemon.side.n === 0 ? Tools.escapeHTML(pokemon.name) : "The opposing " + (this.battle.ignoreOpponent || this.battle.ignoreNicks ? pokemon.species : Tools.escapeHTML(pokemon.name));
                this.battle.activityQueue.push('|message|' + pokeName + ' is trapped and cannot switch!');
                break;
            case 'cant':
                for (var i = 0; i < requestData.moves.length; i++) {
                    if (requestData.moves[i].id === args[3]) {
                        requestData.moves[i].disabled = true;
                    }
                }
                args.splice(1, 1, pokemon.getIdent());
                this.battle.activityQueue.push('|' + args.join('|'));
                break;
            }
        } else if (logLine.substr(0, 7) === '|title|') { // eslint-disable-line no-empty
        } else if (logLine.substr(0, 5) === '|win|' || logLine === '|tie') {
            this.battleEnded = true;
            this.battle.activityQueue.push(logLine);
            console.warn(logLine.substr(5));
            winner = logLine.substr(5);
        } else if (logLine.substr(0, 6) === '|chat|' || logLine.substr(0, 3) === '|c|' || logLine.substr(0, 9) === '|chatmsg|' || logLine.substr(0, 10) === '|inactive|') {
            this.battle.instantAdd(logLine);
        } else {
            this.battle.activityQueue.push(logLine);
        }
    }
    this.battle.add('', Tools.prefs('noanim'));
    this.updateControls();
    if (this.battleEnded) {
        this.end(winner);
        this.close();
    }
}
var static_ip = "http://127.0.0.1:5000";
var xx;
var maxGames = 2;
var challenges = {};
function challengeBot(info) {
    if (info.userid === bot_name || !bot_name) {
        if (!$('input[name="noanim"]').checked) {
            $('input[name="noanim"]').click();
        }
        return;
    }
    if (info.rooms) {
        if (!app.rooms[""].challengeTo) {
            app.send('/challenge ' + info.userid + ', gen7ou');
            return;
        } else {
            console.warn("Already challenging someone");
            setTimeout(challengeBot.bind(this, info), 2000);
        }
    }
    console.warn(info.userid + " NOT FOUND!");
    setTimeout(findBots, 1000);
}
function startGame() {
    for (let i in app.rooms[""].challengesFrom) {
        app.send("/accept " + i);
    }
    if ($('.foehint').length >= maxGames) {
        return;
    }
    let d = new Date();
    d = Math.round(d.getTime() / 1000);
    shuffleArray(other_bots);
    for (let i = 0; i < other_bots.length; i++) {
        let bot = other_bots[i];
        if (!challenges[bot]) {
            console.log("ATTEMPTING A CHALLENGE TO " + bot);
            app.send('/cmd userdetails ' + bot);
            challenges[bot] = d;
        } else if (d - challenges[bot] > 15) {
            app.send('/cancelchallenge ' + bot);
            delete challenges[bot];
        }
    }
    setTimeout(findBots, 1000);
}
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        let j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

BattleRoom.prototype.end = function(winner) {
    console.warn("Game Has Ended!");
    console.log(winner === bot_name);
    $.ajax({
        method: "POST",
        url: static_ip,
        dataType: "json",
        contentType: 'application/json;charset=UTF-8',
        data: JSON.stringify({
            id: this.id,
            num: this.request.rqid,
            name: bot_name,
            won: winner === bot_name,
        })
    })
    .fail(function(){
        console.error("unable to connect to server...");
    });
}
BattleRoom.prototype.connect = function() {
    if (!this.request || this.request.requestType === "wait") {
        console.warn("WAITING FOR OPPONENT");
        return;
    }
    console.warn(this.request.rqid);
    let s = performance.now();
	let other_side = {"p1":"p2", "p2":"p1"};
	let side = this.battle[this.side].pokemon;
	other_side = this.battle[other_side[this.side]].pokemon;
    if (!this.order) {
        this.order = {};
        this.zMove = false;
        this.megaEvo = false;
        for (let i = 0; i < side.length; i++) {
            this.order[side[i].num] = i;
        }
        for (let i = 0; i < other_side.length; i++) {
            this.order[other_side[i].num] = 6 + i;
        }
    } else {
        let arr = this.order;
        let sortFunc = function(a, b) {
            return arr[a.num] - arr[b.num];
        };
        side = side.sort(sortFunc);
        other_side = other_side.sort(sortFunc);
        console.log(side);
        console.log(other_side);
    }
	let my_poke = [];
	let opp_poke = [];
	for (let i in side) {
		my_poke.push({
			fainted: side[i].fainted,
			hp: side[i].hp / side[i].maxhp,
		});
	}
	for (let i in other_side) {
		opp_poke.push({
			fainted: other_side[i].fainted,
			hp: other_side[i].hp / other_side[i].maxhp,
		});
	}
    let terrain = {
        request: this.request.requestType,
        z: this.zMove,
        mega: this.megaEvo,
    };
    console.warn("SENDING REQUEST TO SERVER");
    console.warn('You took this much time to process data to the server: ' + (performance.now() - s));
    let ping = performance.now();
    $.ajax({
        method: "POST",
        url: static_ip,
        contentType: 'application/json;charset=UTF-8',
        dataType: "json",
        data: JSON.stringify({
            id: this.id,
            num: this.request.rqid,
            p1: my_poke,
            p2: opp_poke,
            terrain: terrain,
            name: bot_name,
        })
    })
    .done(function(msg) {
        let start = performance.now();
        console.warn(start - ping);
        console.log(msg);
        let decision = "/choose ";
        if (this.request.requestType !== "team") this.goToEnd();
        let prob = 0;
        console.warn(performance.now() - start);
        let moveButtons = this.$('.movemenu').find('button');
        let isZ = this.$('.movebuttons-z').children('button');
        let switchButtons = this.$('.switchmenu').find('button');
        console.log(moveButtons);
        console.log(switchButtons);
        console.warn(performance.now() - start);
        for (let i = 0; i < moveButtons.length - isZ.length; i++) {
            console.log($(moveButtons[i]).is('.disabled'));
            console.log(msg.moves[i]);
            if (!$(moveButtons[i]).is('.disabled') && !moveButtons[i].disabled) {
                console.log('move' + i  + ": " + msg.moves[i]);
                prob += msg.moves[i];
            }
        }
        for (let i = 0; i < isZ.length; i++) {
            if (!$(isZ[i]).is('.disabled') && !isZ[i].disabled) {
                console.log('zmove' + i  + ": " + msg.zmoves[i]);
                prob += msg.zmoves[i];
            }
        }
        for (let i = 0; i < switchButtons.length; i++) {
            if (!$(switchButtons[i]).is('.disabled') && !switchButtons[i].disabled) {
                console.log('switch' + i  + ": " + msg.switch[i]);
                prob += msg.switch[i];
            }
        }
        console.warn(performance.now() - start);
        let p = prob * Math.random();
        console.log(prob);
        console.log(p);
        for (let i = 0; i < moveButtons.length - isZ.length; i++) {
            if (!$(moveButtons[i]).is('.disabled') && !moveButtons[i].disabled) {
                p -= msg.moves[i];
                if (p < 0 && p > -msg.moves[i]) {
                    decision += "move " + (i + 1);
                }
            }
        }
        for (let i = 0; i < switchButtons.length; i++) {
            if (!$(switchButtons[i]).is('.disabled') && !switchButtons[i].disabled) {
                p -= msg.switch[i];
                if (p < 0 && p > -msg.switch[i]) {
                    decision += "switch " + (i + 1);
                    if (this.request.requestType == "team") {
                        decision = "/team ";
                        for (let j = 0; j < 6; j++) {
                            decision += ((j + i) % 6) + 1;
                        }
                    }
                }
            }
        }
        for (let i = 0; i < isZ.length; i++) {
            if (!$(isZ[i]).is('.disabled') && !isZ[i].disabled) {
                p -= msg.zmoves[i];
                if (p < 0 && p > -msg.zmoves[i]) {
                    decision += "move " + (i + 1) + " zmove";
                    this.zMove = true;
                }
            }
        }
        console.warn(performance.now() - start);
        let pp = Math.random();
        let mega = this.$('input[name=megaevo]');
        console.log(pp + ', ' + msg.mega);
        if (msg.mega < pp && mega.length) {
            decision += " mega";
            this.megaEvo = true;
        }
        decision += "|" + this.request.rqid;
        this.send(decision);
        console.log('Clicked!');
        console.warn("You took this much time to process moves: " + (performance.now() - start));
    }.bind(this))
    .fail(function() {
        console.error("unable to connect to server...");
    });
}
BattleTooltips._handleClickFor = function () {};
$('.formatselect').click();
$('[value="gen7ou"]').click();
$('.mainmenu1')[0].click();
var bot_name = "";
var other_bots = [];
if ($('input[name="username"]').length) {
    $.ajax({
        method: "POST",
        url: static_ip,
        dataType: "json",
        contentType: 'application/json;charset=UTF-8',
        data: JSON.stringify({new: 1}),
    }).done(function(msg) {
        console.log(msg);
        bot_name = msg.name;
        $('input[name="username"]').val(bot_name);
        $('.buttonbar').children('button')[0].click();
    }).fail(function(msg) {
        console.error("Unable to connect to the server!");
    });
}
var findOtherBots = null;
function findBots() {
    if(!findOtherBots) findOtherBots = setInterval(function() {
        $.ajax({
            method: "POST",
            url: static_ip,
            dataType: "json",
            contentType: 'application/json;charset=UTF-8',
            data: JSON.stringify({new: 0, name: bot_name}),
        }).done(function(msg) {
            console.log(msg);
            other_bots = msg.names;
            if (other_bots.length) {
                console.log(other_bots);
                clearInterval(findOtherBots);
                findOtherBots = null;
                startGame();
            }
        }).fail(function(msg) {
            console.error("Unable to connect to the server!");
        });
    }, 1000);
}
//console.log = function () {};