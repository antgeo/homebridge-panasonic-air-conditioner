var request = require("request");

var Service, Characteristic;

module.exports = function(homebridge) {
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;
	Accessory = homebridge.hap.Accessory;

	homebridge.registerAccessory("homebridge-panasonic-air-conditioner", "PanasonicAirConditioner", PanasonicAC);
};

function PanasonicAC(log, config) {
	this.log = log;
	this.name = config["name"];
	this.email = config["email"];
	this.password = config["password"];
	this.debug = config["debug"] || false;
	this.token = null;
	this.device = null;
	this.version = "1.5.1";

	this.values = [];
	this.values.Active = Characteristic.Active.INACTIVE;
	this.values.CurrentTemperature = null;
	this.values.ThresholdTemperature = null;

	// log us in
	request.post({
		url: "https://accsmart.panasonic.com/auth/login/",
		headers: {
			"Accept": "application/json; charset=UTF-8",
			"Content-Type": "application/json",
			"X-APP-TYPE": 0,
			"X-APP-VERSION": this.version
		},
		json: {
			"loginId": config["email"],
			"language": "0",
			"password": config["password"]
		},
		rejectUnauthorized: false
	}, function(err, response, body) {
		if (!err && response.statusCode == 200) {
			this.token = body['uToken'];
			request.get({
				url: "https://accsmart.panasonic.com/device/group/",
				headers: {
					"Accept": "application/json; charset=UTF-8",
					"Content-Type": "application/json",
					"X-APP-TYPE": 0,
					"X-APP-VERSION": this.version,
					"X-User-Authorization": this.token
				},
				json: "",
				rejectUnauthorized: false
			}, function(err, response, body) {
				if (!err && response.statusCode == 200) {
					var body = JSON.parse(body);
					this.device = body['groupList'][0]['deviceIdList'][0]['deviceGuid'];
					this.log("Logged into Panasonic account");
				}
				else {
					this.log("Could not find any Panasonic Air Conditioner devices | Error # " + body['code'] + ": " + body['message']);
					this.HeaterCooler.getCharacteristic(Characteristic.StatusFault).updateValue(Characteristic.StatusFault.GENERAL_FAULT);
				}
			}.bind(this));
		}
		else {
			this.log("Could not login to Panasonic account | Error # " + body['code'] + ": " + body['message']);
			this.HeaterCooler.getCharacteristic(Characteristic.StatusFault).updateValue(Characteristic.StatusFault.GENERAL_FAULT);
		}
	}.bind(this));
}

PanasonicAC.prototype = {

	identify: function(callback) {
		this.log("identify");
		callback();
	},

	getServices: function() {
		this.HeaterCooler = new Service.HeaterCooler(this.name);

		this.HeaterCooler
			.getCharacteristic(Characteristic.Active)
			.on('get', this._getValue.bind(this, "Active"))
			.on('set', this._setValue.bind(this, "Active"));

		this.HeaterCooler
			.getCharacteristic(Characteristic.CurrentTemperature)
			.setProps({
				minValue: 0,
				maxValue: 100,
				minStep: 0.01
			})
			.on('get', this._getValue.bind(this, "CurrentTemperature"));

		this.HeaterCooler
			.getCharacteristic(Characteristic.TargetTemperature)
			.setProps({
				minValue: 16,
				maxValue: 30,
				minStep: 0.5
			})
			.on('get', this._getValue.bind(this, "ThresholdTemperature"))
			.on('set', this._setValue.bind(this, "ThresholdTemperature"));

		this.HeaterCooler
			.getCharacteristic(Characteristic.HeatingThresholdTemperature)
			.setProps({
				minValue: 16,
				maxValue: 30,
				minStep: 0.5
			})
			.on('set', this._setValue.bind(this, "ThresholdTemperature"));

		this.HeaterCooler
			.getCharacteristic(Characteristic.CoolingThresholdTemperature)
			.setProps({
				minValue: 16,
				maxValue: 30,
				minStep: 0.5
			})
			.on('set', this._setValue.bind(this, "ThresholdTemperature"));

		this.HeaterCooler
			.getCharacteristic(Characteristic.CurrentHeaterCoolerState);

		this.HeaterCooler
			.getCharacteristic(Characteristic.TargetHeaterCoolerState)
			.on('set', this._setValue.bind(this, "TargetHeaterCoolerState"));

		this.SwitchEconavi = new Service.Switch("ECONAVI", "PanasonicAC-ECONAVI");
		this.SwitchEconavi.getCharacteristic(Characteristic.On)
			.on('set', this._setValue.bind(this, "Econavi"));

		this.SwitchQuiet = new Service.Switch("Quiet", "PanasonicAC-Quiet");
		this.SwitchQuiet.getCharacteristic(Characteristic.On)
			.on('set', this._setValue.bind(this, "Quiet"));

		this.SwitchPowerful = new Service.Switch("Powerful", "PanasonicAC-Powerful");
		this.SwitchPowerful.getCharacteristic(Characteristic.On)
			.on('set', this._setValue.bind(this, "Powerful"));

		var informationService = new Service.AccessoryInformation();
		informationService
			.setCharacteristic(Characteristic.Name, this.name)
			.setCharacteristic(Characteristic.Manufacturer, "Panasonic")
			.setCharacteristic(Characteristic.Model, "CZ-TACG1")
			.setCharacteristic(Characteristic.FirmwareRevision, this.version)
			.setCharacteristic(Characteristic.SerialNumber, this.device);

		return [informationService, this.HeaterCooler, this.SwitchEconavi, this.SwitchQuiet, this.SwitchPowerful];
	},

	_getValue: function(CharacteristicName, callback) {
		if (this.debug) {
			this.log("GET", CharacteristicName);
		}

		if(CharacteristicName == "Active") {
			callback(null, this.values.Active);

			request.get({
				url: "https://accsmart.panasonic.com/deviceStatus/now/" + this.device,
				headers: {
					"Accept": "application/json; charset=UTF-8",
					"Content-Type": "application/json",
					"X-APP-TYPE": 0,
					"X-APP-VERSION": this.version,
					"X-User-Authorization": this.token
				},
				rejectUnauthorized: false
			}, function(err, response, body) {
				if (!err && response.statusCode == 200) {
					var json = JSON.parse(body);

					if (json['parameters']['insideTemperature'] < 100) {
						this.values.CurrentTemperature = json['parameters']['insideTemperature'];
						this.HeaterCooler.getCharacteristic(Characteristic.CurrentTemperature).updateValue(this.values.CurrentTemperature);

						if (json['parameters']['insideTemperature'] < json['parameters']['temperatureSet']) {this.HeaterCooler.getCharacteristic(Characteristic.CurrentHeaterCoolerState).setValue(Characteristic.CurrentHeaterCoolerState.HEATING);}
						else if (json['parameters']['insideTemperature'] > json['parameters']['temperatureSet']) {this.HeaterCooler.getCharacteristic(Characteristic.CurrentHeaterCoolerState).setValue(Characteristic.CurrentHeaterCoolerState.COOLING);}
						else {this.HeaterCooler.getCharacteristic(Characteristic.CurrentHeaterCoolerState).setValue(Characteristic.CurrentHeaterCoolerState.IDLE);}
					}
					else if (json['parameters']['outTemperature'] < 100) {
						this.values.CurrentTemperature = json['parameters']['outTemperature'];
						this.HeaterCooler.getCharacteristic(Characteristic.CurrentTemperature).updateValue(this.values.CurrentTemperature);

						if (json['parameters']['outTemperature'] < json['parameters']['temperatureSet']) {this.HeaterCooler.getCharacteristic(Characteristic.CurrentHeaterCoolerState).setValue(Characteristic.CurrentHeaterCoolerState.HEATING);}
						else if (json['parameters']['outTemperature'] > json['parameters']['temperatureSet']) {this.HeaterCooler.getCharacteristic(Characteristic.CurrentHeaterCoolerState).setValue(Characteristic.CurrentHeaterCoolerState.COOLING);}
						else {this.HeaterCooler.getCharacteristic(Characteristic.CurrentHeaterCoolerState).setValue(Characteristic.CurrentHeaterCoolerState.IDLE);}
					}
					else {
						this.values.CurrentTemperature = null;
						this.HeaterCooler.getCharacteristic(Characteristic.CurrentTemperature).updateValue(null);
						this.HeaterCooler.getCharacteristic(Characteristic.CurrentHeaterCoolerState).setValue(Characteristic.CurrentHeaterCoolerState.IDLE);
					}

					this.values.ThresholdTemperature = json['parameters']['temperatureSet'];
					this.HeaterCooler.getCharacteristic(Characteristic.TargetTemperature).updateValue(this.values.ThresholdTemperature);
					this.HeaterCooler.getCharacteristic(Characteristic.HeatingThresholdTemperature).updateValue(this.values.ThresholdTemperature);
					this.HeaterCooler.getCharacteristic(Characteristic.CoolingThresholdTemperature).updateValue(this.values.ThresholdTemperature);

					switch (json['parameters']['operationMode']) {
						case 0: // auto
							this.HeaterCooler.getCharacteristic(Characteristic.TargetHeaterCoolerState).setValue(Characteristic.TargetHeaterCoolerState.AUTO);
							break;

						case 3: // heat
							this.HeaterCooler.getCharacteristic(Characteristic.TargetHeaterCoolerState).setValue(Characteristic.TargetHeaterCoolerState.HEAT);
							break;

						case 2: // cool
							this.HeaterCooler.getCharacteristic(Characteristic.TargetHeaterCoolerState).setValue(Characteristic.TargetHeaterCoolerState.COOL);
							break;
					}

					if (json['parameters']['ecoNavi'] == 2) {this.SwitchEconavi.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.ACTIVE);}
					else {this.SwitchEconavi.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.INACTIVE);}

					if (json['parameters']['ecoMode'] == 2) {this.SwitchQuiet.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.ACTIVE);}
					else {this.SwitchQuiet.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.INACTIVE);}

					if (json['parameters']['ecoMode'] == 1) {this.SwitchPowerful.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.ACTIVE);}
					else {this.SwitchPowerful.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.INACTIVE);}

					if (json['parameters']['operate'] == 1) {
						this.values.Active = Characteristic.Active.ACTIVE;
						this.HeaterCooler.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.ACTIVE);
					}
					else {
						this.values.Active = Characteristic.Active.INACTIVE;
						this.HeaterCooler.getCharacteristic(Characteristic.Active).updateValue(Characteristic.Active.INACTIVE);
					}

					this.HeaterCooler.getCharacteristic(Characteristic.StatusFault).updateValue(Characteristic.StatusFault.NO_FAULT);
				}
				else {
					this.log("Could not send GET command | Error # " + body['code'] + ": " + body['message']);
					this.HeaterCooler.getCharacteristic(Characteristic.StatusFault).updateValue(Characteristic.StatusFault.GENERAL_FAULT);
				}
			}.bind(this));
		}
		else if(CharacteristicName == "CurrentTemperature") {callback(null, this.values.CurrentTemperature);}
		else if(CharacteristicName == "ThresholdTemperature") {callback(null, this.values.ThresholdTemperature);}
		else {callback(null);}
	},

	_setValue: function(CharacteristicName, value, callback) {
		if (this.debug) {
			this.log("SET", CharacteristicName, value);
		}

		var parameters;

		switch (CharacteristicName) {
			case "Active":
				if (value == Characteristic.Active.ACTIVE) {
					parameters = {
						"operate": 1
					};
				} else {
					parameters = {
						"operate": 0
					};
				}
				break;

			case "TargetHeaterCoolerState":
				switch (value) {
					case Characteristic.TargetHeaterCoolerState.COOL:
						parameters = {
							"operationMode": 2
						};
						this.HeaterCooler.getCharacteristic(Characteristic.CurrentHeaterCoolerState).setValue(3);
						break;

					case Characteristic.TargetHeaterCoolerState.HEAT:
						parameters = {
							"operationMode": 3
						};
						this.HeaterCooler.getCharacteristic(Characteristic.CurrentHeaterCoolerState).setValue(2);
						break;

					case Characteristic.TargetHeaterCoolerState.AUTO:
						parameters = {
							"operationMode": 0
						};
						this.HeaterCooler.getCharacteristic(Characteristic.CurrentHeaterCoolerState).setValue(0);
						break;
				}
				break;

			case "ThresholdTemperature":
				parameters = {
					"temperatureSet": value
				};
				break;

			case "Econavi":
				if (value == Characteristic.Active.ACTIVE) {
					parameters = {
						"ecoNavi": 2
					};
				} else {
					parameters = {
						"ecoNavi": 1
					};
				}
				break;

			case "Quiet":
				if (value == Characteristic.Active.ACTIVE) {
					parameters = {
						"ecoMode": 2
					};
				} else {
					parameters = {
						"ecoMode": 0
					};
				}
				break;

			case "Powerful":
				if (value == Characteristic.Active.ACTIVE) {
					parameters = {
						"ecoMode": 1
					};
				} else {
					parameters = {
						"ecoMode": 0
					};
				}
				break;
		}

		request.post({
			url: "https://accsmart.panasonic.com/deviceStatus/control/",
			headers: {
				"Accept": "application/json; charset=UTF-8",
				"Content-Type": "application/json",
				"X-APP-TYPE": 0,
				"X-APP-VERSION": this.version,
				"X-User-Authorization": this.token
			},
			json: {
				"deviceGuid": this.device,
				"parameters": parameters
			},
			rejectUnauthorized: false
		}, function(err, response, body) {
			if (!err && response.statusCode == 200) {
				callback();

				if (body.result !== 0) {
					this.log("Could not send SET command | Error # " + body['code'] + ": " + body['message']);
					this.HeaterCooler.getCharacteristic(Characteristic.StatusFault).updateValue(Characteristic.StatusFault.GENERAL_FAULT);
				}
				else {this.HeaterCooler.getCharacteristic(Characteristic.StatusFault).updateValue(Characteristic.StatusFault.NO_FAULT);}
			}
			else {
				this.log("Could not send SET command | Error # " + body['code'] + ": " + body['message']);
				this.HeaterCooler.getCharacteristic(Characteristic.StatusFault).updateValue(Characteristic.StatusFault.GENERAL_FAULT);
			}
		}.bind(this));
	}

};
