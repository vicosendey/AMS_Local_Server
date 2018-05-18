const express = require("express");
const bodyParser = require('body-parser');
const Serialport = require('serialport');
const socketIo = require('socket.io');
const http = require('http');
const five = require("johnny-five");
const fetch = require('node-fetch');
const app = express();
const server = http.createServer(app);
const io = socketIo.listen(server);
const axios = require('axios');
let moment = require('moment-timezone');
let portsArray = [];
let COMs = [];
let portaAnterior = null;
let portaAtual = 'COM1';
let board = null;
let seconds = 0, minutes = 0, hours = 0;
let secStr = "", minStr = "", hourStr = "";
require('events').EventEmitter.prototype._maxListeners = 100;


//----------------LED VARIABLES----------------
let onLED = true;
let strengthLED = 0;
let targetTimeLED = 10;
let firstMomentLED = new moment();
let lastMomentLED = new moment();
let offMomentLED = null;
let onMomentLED = null;
let modeLED = 'auto';
let clockLED = new moment("000000").format("MM/DD/YYYY-HH:mm:ss");
firstMomentLED.tz("America/Sao_Paulo").format();
lastMomentLED.tz("America/Sao_Paulo").format();
let ledStatus = "";
//---------------------------------------------
//--------------WATER LEVEL VARIABLES----------
let waterStatus = "";
let profSensor = 0;
//---------------------------------------------

//---------------BOIA-----------------
let digitalBoia = 0;

//--------------- TEMPERATURE VARIABLES -----------------
let currentTemp = 0;
let targetTemp = 27;
let onHeater = true;
let heaterBool = false;
let heaterStatus = "";
//-------------------------------------------------------

//------------------ SERVO VARIABLES --------------------
let onFood = true;
let modeFOOD = 'auto';
let targetTimeFOOD = 24;
let firstMomentFOOD = new moment();
let lastMomentFOOD = new moment();
let clockFOOD = new moment("000000").format("MM/DD/YYYY-HH:mm:ss");
let lastFed = null;
let nextFed = new moment().tz("America/Sao_Paulo").add(targetTimeFOOD, 'h').format("MM/DD/YYYY-HH:mm:ss");
firstMomentFOOD.tz("America/Sao_Paulo").format();
lastMomentFOOD.tz("America/Sao_Paulo").format();
//-------------------------------------------------------

let jsonAction = {}

let arrTemps = [];
let arrTimes = [];

const getInfo = ()=>{
    const user = {
        uid: "FqFgZD6F9oQVV04mQ3JzgtHyZqq1"
    }
    fetch('https://ams-aquarium.herokuapp.com/api/get_all_aquariums', {
            method: 'post',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(user)
        })
        .then(response => response.json())
      .then(response => {
        console.log(response)
      })
        .catch(error => console.log(error))
}

setInterval(getInfo, 1000);

const sendInfo = ()=>{
    arrTemps.push(currentTemp);
    arrTimes.push(new moment().tz("America/Sao_Paulo").format("MM/DD/YYYY-HH:mm:ss"));
    if(arrTemps.length > 5 && arrTimes.length > 5){
        const data = {
            uid: "FqFgZD6F9oQVV04mQ3JzgtHyZqq1",
            idAquarium: "serialNumberFromArduino",
            aquarium: {
              name: "aquarioMockData",
              food: {
                hoursCycleFood: targetTimeFOOD,
                feededToday: lastFed != null ? 1 : 0,
                lastFeed: lastFed != null ? lastFed.format("MM/DD/YYYY-HH:mm:ss") : null,
                nextFeed: nextFed
              },
              temperature: {
                working: onHeater,
                targetTemp: targetTemp,
                celsius: arrTemps,
                time: arrTimes
              },
              waterLevel: waterStatus,
              luminosity: {
                working: onLED,
                strength: (strengthLED/255)*100,
                hoursCycleLED: targetTimeLED
              },
              _settings: {
                targetTemp: targetTemp,
                hoursCycleFood: targetTimeFOOD,
                hoursCycleLED: targetTimeLED
              }
            }
        };
        fetch('https://ams-aquarium.herokuapp.com/api/update_aquarium_status', {
            method: 'post',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        })
        .then(response => console.log(response))
        .catch(error => console.log(error))
        arrTemps = [];
        arrTimes = [];
    }
}

setInterval(sendInfo, 1000);

board = new five.Board({ port: 'COM3', repl: false, autoRun: true,  samplingInterval: 100, baud: 9600});

board.on("ready", function() {
    this.pinMode(5, five.Pin.PWM);
    this.pinMode(1, five.Pin.ANALOG);
    this.pinMode(0, five.Pin.ANALOG);
    this.pinMode(2, five.Pin.OUTPUT);
    this.pinMode(6, five.Pin.SERVO);
    this.pinMode(8, five.Pin.INPUT);
    this.digitalWrite(2, 1);
    let foodServo = new five.Servo(6);
    let verifyTemp = () =>{
        //console.log(currentTemp);
        if(currentTemp >= targetTemp){
            if(onHeater){
                this.digitalWrite(2, 1);
                heaterStatus = "OFF";
            }
        } else{
            if(onHeater){
                this.digitalWrite(2, 0);
                heaterStatus = "ON";
            }
        }
        if(!onHeater){
            this.digitalWrite(2, 1);
            heaterStatus = "OFF";
        }
    }

    setInterval(verifyTemp,1000);
    let pin = 7;
    board.io.sendOneWireConfig(pin, true);
    board.io.sendOneWireSearch(pin, function(error, devices) {
        if(error) {
        console.error(error);
        return;
        }

        // only interested in the first device
        let device = devices[0];

        let readTemperature = function() {
            // start transmission
            board.io.sendOneWireReset(pin);

            // a 1-wire select is done by ConfigurableFirmata
            board.io.sendOneWireWrite(pin, device, 0x44);

            // the delay gives the sensor time to do the calculation
            board.io.sendOneWireDelay(pin, 100);

            // start transmission
            board.io.sendOneWireReset(pin);

            // tell the sensor we want the result and read it from the scratchpad
            board.io.sendOneWireWriteAndRead(pin, device, 0xBE, 9, function(error, data) {
                if(error) {
                console.error(error);
                return;
                }
                var raw = (data[1] << 8) | data[0];
                var celsius = raw / 16.0;
                currentTemp = celsius;
                //console.info("celsius", celsius);
            });
        };
        setInterval(readTemperature,1000);
    });
    const verifyLed = () => {
        //console.log(clockLED);
        if(onLED){
            if(modeLED === 'auto'){
                lastMomentLED = new moment();
                lastMomentLED.tz("America/Sao_Paulo").format();
                this.analogWrite(5, strengthLED);
                ledStatus = "ON";
                clockLED = new moment(clockLED).add(1, 's').format("MM/DD/YYYY-HH:mm:ss");
            }
            else{
                this.analogWrite(5, strengthLED);
                if(strengthLED === 0){
                    ledStatus = "OFF";
                } else{
                    ledStatus = "ON";
                }
            }
        }
        else{
            this.analogWrite(5, 0);
            ledStatus = "OFF";
            if(modeLED === 'auto'){
                clockLED = new moment(clockLED).add(1, 's').format("MM/DD/YYYY-HH:mm:ss");
            } else{
                this.analogWrite(5, strengthLED);
                modeLED = modeLED;
            }
            lastMomentLED = new moment();
            lastMomentLED.tz("America/Sao_Paulo").format();
        }
        if(parseFloat(moment.duration(lastMomentLED.diff(firstMomentLED)).as("hours")) >= targetTimeLED){
            if(onLED){
                onLED = false;
                ledStatus = "OFF";
                //console.log("LED is OFF");
            }
            else{
                onLED = true;
                ledStatus = "ON";
                //console.log("LED is ON");
            }
            clockLED = new moment("000000", 'Hmm').format("MM/DD/YYYY-HH:mm:ss");
            firstMomentLED = new moment();
            firstMomentLED.tz("America/Sao_Paulo").format();
            lastMomentLED = new moment();
            lastMomentLED.tz("America/Sao_Paulo").format();
                        
        }
    }
    setInterval(verifyLed, 1000);
    //---------------------------SERVO---------------------------
    let verifyFood = () =>{
        if(modeFOOD === "auto"){
            if(onFood){
                lastMomentFOOD = new moment();
                lastMomentFOOD.tz("America/Sao_Paulo").format();
                clockFOOD = new moment(clockFOOD).add(1, 's').format("MM/DD/YYYY-HH:mm:ss");
            }
            else{
                lastMomentFOOD = new moment();
                lastMomentFOOD.tz("America/Sao_Paulo").format();
                clockFOOD = new moment(clockFOOD).add(1, 's').format("MM/DD/YYYY-HH:mm:ss");
            }
            if(parseFloat(moment.duration(lastMomentFOOD.diff(firstMomentFOOD)).as("hours")) >= targetTimeFOOD){
                foodServo.to(200, 500);
                foodServo.to(90, 500);
                clockFOOD = new moment("000000").format("MM/DD/YYYY-HH:mm:ss");
                lastFed = new moment().tz("America/Sao_Paulo").format("MM/DD/YYYY-HH:mm:ss");
                nextFed = new moment(lastFed).add(targetTimeFOOD, 'd').format("MM/DD/YYYY-HH:mm:ss");
                firstMomentFOOD = new moment();
                firstMomentFOOD.tz("America/Sao_Paulo").format();
                lastMomentFOOD = new moment();
                lastMomentFOOD.tz("America/Sao_Paulo").format();
            }
        }
        else{
            foodServo.to(180, 500);
            foodServo.to(90, 500);
            modeFOOD = "auto";
        }
    }
    setInterval(verifyFood, 1000);
    const verifyProf = () => {
        if(profSensor >= 705){
            waterStatus = "0";
        } else if(profSensor < 700 && profSensor > 0){
            waterStatus = "1";
        } else if(profSensor === 0){
            waterStatus = "2";
        }
    }
    setInterval(verifyProf, 1000);
    const verifyBoia = () =>{
        if(digitalBoia === 1){
            waterStatus = "3";
        } else{
            waterStatus = "2";
        }
        console.log(waterStatus);
    }
    setInterval(verifyBoia, 1000);
    this.loop(1000, () => {
        console.log("Temp: " + currentTemp + "C " + "LED Status: " + onLED + " LED Cicle: " + targetTimeLED + "h " + "LED Strength: " + strengthLED + " Heater Status: " + onHeater + " Food Cicle: " + targetTimeFOOD);
        //-----------------------------------Controle Fita LED---------------------------------
        this.analogRead(1, function(analogNumber){
            if(modeLED === 'auto'){
                strengthLED = five.Fn.map(analogNumber, 0, 1023, 255, 0);
            }
        });
        //-----------------------------------WATER LEVEL---------------------------------
        this.analogRead(0, function(analogNumber){
            profSensor = analogNumber;
        });
        //----------------------- BOIA ------------------------------
        this.digitalRead(8, function(value) {
            digitalBoia = value;
        });
        //----------------------------------------------------------------------------------------
        
    });
});

app.set("view engine", "ejs");

app.use(bodyParser.urlencoded({
    extended: true,
}));

app.use(express.static(__dirname + '/public'));

app.use(bodyParser.json()); 

app.use(bodyParser.urlencoded({
    extended: true,
}));

app.get("/", function (req, res) {
    res.redirect("/aquarium");
});


app.get("/aquarium", function (req, res) {
    res.render("index");
});

app.get('/api/test', function (req, res) {
    // http://ams-aquarium.herokuapp.com/api/update_status
    fetch('http://localhost:3030/api/test', {
        method: 'post',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(postExmple)
    })
        .then(response => console.log(response))
        .catch(error => console.log(error))
    res.redirect('/');
});

app.post('/api/test', function (req, res) {
    const Json = JSON.parse(JSON.stringify(req.body));
    console.log(Json.aquarium); 
});

app.post("/manual-led-controll", function(req, res){
    try {
        if (req.body.ledon || req.body.ledoff || req.body.ledstrh || req.body.ledmode || req.body.ledcicle) {
            if (req.body.ledon){
                onLED = true;
                clockLED = new moment("000000", 'Hmm').format("MM/DD/YYYY-HH:mm:ss");
                res.send("Light is ON!");
            } 
            if (req.body.ledoff){
                onLED = false;
                clockLED = new moment("000000", 'Hmm').format("MM/DD/YYYY-HH:mm:ss");
                res.send("Light is OFF!");
            } 
            if(req.body.ledstrh){
                modeLED = 'manual';
                strengthLED = req.body.ledstrh;
                res.send("Light Strength: " + req.body.ledstrh);
            }
            if(req.body.ledmode){
                modeLED = 'auto';
                onLED = true;
                targetTimeLED = 12;
                clockLED = new moment("000000", 'Hmm').format("MM/DD/YYYY-HH:mm:ss");
                firstMomentLED = new moment();
                lastMomentLED = new moment();
                res.send("LED MODE: " + req.body.ledmode);
            }
            if(req.body.ledcicle){
                clockLED = new moment("000000", 'Hmm').format("MM/DD/YYYY-HH:mm:ss");
                firstMomentLED = new moment();
                lastMomentLED = new moment();
                targetTimeLED = parseFloat(req.body.ledcicle);
                res.send("Cicle Time is: " + req.body.ledcicle + " hours");
            }
        }
    } catch (error) {
        res.status(500).json(error);
    }
});

app.get("/get-info", function(req,res){
    let perLed = ((strengthLED*100)/255).toFixed(0);
    let stringStatus = heaterStatus + " " + ledStatus + " "  + perLed + " " + lastFed + " " + clockLED + " " + targetTimeLED + " " + targetTimeFOOD + " " + targetTemp + " " + clockFOOD + " " + waterStatus;
    res.send(stringStatus);
});

app.post("/manual-heater-controll", function(req, res){
    try {
        if (req.body.heateron || req.body.heateroff || req.body.targettemp) {
            if (portaAtual !== null) {
                if (req.body.heateron){
                    onHeater = true;
                    res.send("Heater is ON!");
                } 
                if (req.body.heateroff){
                    onHeater = false;
                    res.send("Heater is OFF!");
                } 
                if(req.body.targettemp){
                    targetTemp = parseFloat(req.body.targettemp);
                    res.send("Tempature Target now is: " + req.body.targettemp + "C");
                }
            }
        }
    } catch (error) {
        res.status(500).json(error);
    }
});

app.get("/get-temp",function(req,res){
    res.send(currentTemp.toString());
});

app.post("/manual-food-controll", function(req, res){
    try {
        if (req.body.targetfoodtime || req.body.defaultfoodtime || req.body.manualfeed) {
            if (portaAtual !== null) {
                if (req.body.manualfeed){
                    modeFOOD = "manual";
                    lastFed = new moment().tz("America/Sao_Paulo").format("MM/DD/YYYY-HH:mm:ss");
                    res.send("Now");
                } 
                if(req.body.targetfoodtime){
                    targetTimeFOOD = parseFloat(req.body.targetfoodtime);
                    clockFOOD = new moment("000000").format("MM/DD/YYYY-HH:mm:ss");
                    firstMomentFOOD = new moment();
                    firstMomentFOOD.tz("America/Sao_Paulo").format();
                    lastMomentFOOD = new moment();
                    lastMomentFOOD.tz("America/Sao_Paulo").format();
                    res.send("Food Time Target now is: " + req.body.targetfoodtime + "h");
                }
                if(req.body.defaultfoodtime){
                    clockFOOD = new moment("000000").format("MM/DD/YYYY-HH:mm:ss");
                    targetTimeFOOD = 24;
                    res.send("Food Time Target now is in default mode");
                }
            }
        }
    } catch (error) {
        res.status(500).json(error);
    }
});

app.post("/aquarium", function (req, res) {
    try {
        if (req.body.ledon || req.body.ledoff) {
            if (portaAtual !== null) {
                const led = new five.Led(13);
                if (req.body.ledon) led.on(); res.redirect('/');
                if (req.body.ledoff) led.off(); res.redirect('/');
            }
        } else if (req.body.port) {
            new five.Board({
                port: req.body.port,
                repl: false
            });
            res.redirect("/");
        }
        console.log(req.body);
    } catch (error) {
        res.status(500).json(error);
    }
});

server.listen(3030, () => {
    console.log("Server Ok"); 
});