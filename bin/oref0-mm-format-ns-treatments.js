#!/usr/bin/env node

/*
  Format Pump history to Nightscout treatment events

  Released under MIT license. See the accompanying LICENSE.txt file for
  full terms and conditions

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
  THE SOFTWARE.

*/

var _ = require('lodash');
var moment = require('moment');
var find_insulin = require('oref0/lib/temps');
var find_bolus = require('oref0/lib/bolus');
var describe_pump = require('oref0/lib/pump');

var ignoreEventTypes = ['BasalProfileStart','Sara6E'];

var basalEvents = ['TempBasalDuration','TempBasal'];

var bolusEvents = ['Bolus','Meal Bolus', 'BolusWizard'];

function isTempBasal(event) {
	return (_.indexOf(basalEvents,event._type) >= 0);
}

function isBolusEvent(event) {
	return (_.indexOf(bolusEvents,event._type) >= 0);
}

function isIgnorableEvent(event) {
	return (_.indexOf(ignoreEventTypes,event._type) >= 0);
}

function isMergeable(event1, event2) {
	return ( (isTempBasal(event1) && isTempBasal(event2)) || (isBolusEvent(event1) && isBolusEvent(event2)) && m != n);
}

function isMMOLevent(event) {
	return (event.enteredBy.indexOf('554') >= 0 && event.glucoseType == 'BolusWizard');
}

if (!module.parent) {
    
    var pump_history = process.argv.slice(2, 3).pop();
    var pump_model = process.argv.slice(3, 4).pop();
    var pump_status = process.argv.slice(4, 5).pop();
    var last_time = process.argv.slice(5, 6).pop();
    
    if (last_time) { last_time = moment(last_time); }
    
    if (!pump_history || !pump_model) {
        console.log('usage: ', process.argv.slice(0, 2), '<pump_history.json> <pump_model.json> <pump_status.json> [filter_time]');
        process.exit(1);
    }
    
    var cwd = process.cwd();
    var pump_history_data = require(cwd + '/' + pump_history);
    var pump_model_data = require(cwd + '/' + pump_model);
    var pump_status_data = require(cwd + '/' + pump_status);

	// don't process events during a bolus, due to Bolus Wizard events split to multiple events

	if (pump_status_data.bolusing != false) return;

	var treatments = find_insulin(find_bolus(pump_history_data));
	treatments = describe_pump(treatments);

	var processed = [];
	
	// Filter useless events
		
	treatments = _.filter(treatments,function(event) {
		var eventTime = moment(event.timestamp);
		if (last_time && eventTime.isBefore(last_time)) { return false; }
		if (isIgnorableEvent(event)) { return false; }
		return true;		
	});
		
	// If data contains a bolus event that is newer than 60 seconds
	// and it cannot be merged with another event, filter out all events later than the bolus
	
	var lastBolus = _.findLast(treatments,function(event) {
		return isBolusEvent(event);
	});
	
	if (lastBolus && moment().diff(moment(lastBolus.timestamp)) < -60) {
	
		var foundRecentMergeableEvent = false;
		_.forEach(treatments,function(n) {
			if (eventTime.diff(moment(n.timestamp)) <= -60) {
    	 		if (isMergeable(m,n)) { foundEventToMergeWith = true; }
			}
		});
		
		if (!foundEventToMergeWith) {
			
			var lastBolusTime = moment(lastBolus.timestamp);
		
			treatments = _.filter(treatments,function(event) {
		 		return (moment(event.timestamp).isBefore(lastBolusTime) || event == lastBolus);
			});
		}
	}
		
	// Sort events by priority, so merging will always have the right top event
	
	var rank = {
	"Bolus" : 1,
	'Meal Bolus': 1,
	"Temp Basal" : 2,
	"TempBasal" : 2,
	"BGReceived" : 3,
	"CalBGForPH" : 4,
	"BG Check": 4,
	"BolusWizard" : 5,
	"BasalProfileStart" : 6,
	"TempBasalDuration" : 7
	};

	_.sortBy(treatments,function(event) {

		// Fix some wrongly mapped event types
		// TODO: figure out why the event types are wrong in the first place
		if (event.eventType == '<none>') {
			if (event.insulin) { event.eventType = 'Bolus'; }
			if (event._type == 'CalBGForPH') { event.eventType = 'BG Check'; }
		}
		
		var type = event.eventType ? event.eventType : event._type;
		return rank[event._type] ? rank[event._type] : 8;
		
	});
    
    _.forEach(treatments,function(n) {
		
		// TODO: add support for "Prime" event -> site change?

		// data correction to match Nightscout expectations

		n.created_at = n.created_at ? n.created_at : n.timestamp;
  		n.enteredBy = 'openaps://medtronic/' + pump_model_data;
  		if (n._type == "Bolus" && n.amount && !n.insulin) { this.eventType = 'Correction Bolus'; n.insulin = n.amount;}
  		if (n.carb_input && !n.carbs) {n.carbs = n.carb_input;}
  		if (n.duration == 0) { delete n.duration; }
  		if (n.bg == 0) { delete n.bg; }
  		if (n.carbs == 0) { delete n.carbs; }
  		if (n.glucose == 0) { delete n.glucose; }
		if (n.bg && !n.glucose) { n.glucose = n.bg; }  // everything from Decocare should be in mg/dl
		if ((n.bg || n.glucose) && !n.units) {
			if (isMMOLevent(n)) { n.units = 'mmol';} else { n.units = 'mgdl'; }
		}
		
  		if (n._type == 'CalBGForPH' || n._type == 'BGReceived') { n.eventType = 'BG Check'; this.glucose = this.amount; }
  		if (n.glucose && !n.glucoseType && n.glucose > 0) { n.glucoseType = n.enteredBy; }
  		n.eventType = (n.eventType ? n.eventType : 'Note');
  		if (n.eventType == 'Note') { n.notes = n._type + pump_model_data + (n.notes ? n.notes : '');}

  		// merge events happening within 1 minute
    	
    	var eventTime = moment(n.timestamp);
    	
    	var foundEventToMergeWith = null;
    	
    	 _.forEachRight(processed,function(m) {
    	 	var event2Time = moment(m.timestamp);
    	 	
    	 	if (Math.abs(eventTime.diff(event2Time)) <= 60*1000) {
    	 		
    	 		// only merge Temp Basals with Temp Basals
    	 		// TODO: make data driven - configure mergeable and/or unmergeable event combos
    	 		
    	 		if (isMergeable(m,n)) { foundEventToMergeWith = m; }
	    	 	 			
  	 		}
    	});
    	
    	// contain all source objects inside the processed objects
    	
    	if (foundEventToMergeWith) {
    		if (!foundEventToMergeWith.containedEvents) { foundEventToMergeWith.containedEvents = []; }
    		foundEventToMergeWith.containedEvents.push(n);
    		
    		for (var property in n) {
				if (n.hasOwnProperty(property)) {
					if (!foundEventToMergeWith.hasOwnProperty(property)) {
        				foundEventToMergeWith[property] = n[property];
        			}
    			}
			}
    	} else {
    		processed.push(n);
    	}

    });
    
    // Sort by timestamp for upload
    
    _.sortBy(processed, function(event) {
    	//element will be each array, so we just return a date from first element in it
    	return event.timestamp;
	});

	console.log(JSON.stringify(processed, null, 2));

}
