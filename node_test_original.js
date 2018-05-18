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
let targetTimeLED = 12;
let firstMomentLED = new moment();
let lastMomentLED = new moment();
let offMomentLED = null;
let onMomentLED = null;
let modeLED = 'auto';
firstMomentLED.tz("America/Sao_Paulo").format();
lastMomentLED.tz("America/Sao_Paulo").format();
//---------------------------------------------
//--------------WATER LEVEL VARIABLES----------
let waterStatus = "";
let profSensor = 0;
//---------------------------------------------

//--------------- TEMPERATURE VARIABLES -----------------
let currentTemp = 0;
let targetTemp = 30;
let onHeater = true;
//-------------------------------------------------------

//------------------ SERVO VARIABLES --------------------
let onFood = true;
let targetTimeFOOD = 24;
let firstMomentFOOD = new moment();
let lastMomentFOOD = new moment();
firstMomentFOOD.tz("America/Sao_Paulo").format();
lastMomentFOOD.tz("America/Sao_Paulo").format();
//-------------------------------------------------------

const postExmple = {
    uid: "ER8uojqH0hTOCju7rEGgaMnpieJ3",
    idAquarium: "mockaquariumB",
    aquarium: {
      name: "aquaralho1",
      food: {
        dailyQuantity: "1",
        feededToday: "1",
        lastFeed: "12010202301203",
        nextFeed: "19391293129391"
      },
      temperature: "30",
      waterLevel: "3",
      light: "0.8"
    }
  }

io.on('connection', function (socket) {
    console.log("Socket Connected");
})

setInterval(function () {
    portsArray = [];
    Serialport.list(function (err, data) {
        COMs = data.filter(function (dt) {
            return dt.manufacturer === 'Arduino LLC (www.arduino.cc)' || dt.manufacturer === 'wch.cn';
        });
        COMs.forEach(function (dt) {
            portsArray.push(dt.comName); 
        });
        io.emit('ports:data', {
            value: Array.from(portsArray)
        });
        if (portaAtual === 'COM1' && COMs.length > 0) {
            seconds = 0;
            minutes = 0;
            hours = 0;
            portaAnterior = portaAtual;
            portaAtual = COMs[0].comName;
            board = new five.Board({ port: COMs[0].comName, repl: false, autoRun: true,  samplingInterval: 100, baud: 9600});
        } else if (portaAtual !== 'COM1' && COMs.length === 0) {
            portaAnterior = portaAtual;
            portaAtual = 'COM1';
            seconds = 0;
        } else if(portaAtual !== 'COM1' && COMs.length !== 0){
            board.on("ready", function() {
                this.pinMode(5, five.Pin.PWM);
                this.pinMode(1, five.Pin.ANALOG);
                this.pinMode(0, five.Pin.ANALOG);
                this.pinMode(2, five.Pin.OUTPUT);
                this.pinMode(6, five.Pin.SERVO);
                this.pinMode(8, five.Pin.INPUT);
                //-----------------------------------Controle Fita LED---------------------------------
                this.analogRead(1, function(analogNumber){
                   console.log(analogNumber);
                    if(onLED === true){
                        if(modeLED === 'auto'){
                            lastMomentLED = new moment();
                            lastMomentLED.tz("America/Sao_Paulo").format();
                            strengthLED = five.Fn.map(analogNumber, 0, 1023, 255, 0);
                            this.analogWrite(5, strengthLED);
                        }
                        else{
                            this.analogWrite(5, parseFloat(strengthLED));
                        }
                    }
                    else{
                        this.analogWrite(5, 0);
                        lastMomentLED = new moment();
                        lastMomentLED.tz("America/Sao_Paulo").format();
                    }
                    if(parseFloat(moment.duration(lastMomentLED.diff(firstMomentLED)).as("hours")) >= targetTimeLED){
                        if(onLED){
                            onLED = false;
                            console.log("LED is OFF");
                        }
                        else{
                            onLED = true;
                            console.log("LED is ON");
                        }
                        firstMomentLED = new moment();
                        firstMomentLED.tz("America/Sao_Paulo").format();
                        lastMomentLED = new moment();
                        lastMomentLED.tz("America/Sao_Paulo").format();
                        
                    }
                });
                //----------------------------------------------------------------------------------------
                //-----------------------------------WATER LEVEL---------------------------------
                this.analogRead(0, function(analogNumber){
                    profSensor = analogNumber;
                    if(profSensor >= 705){
                        waterStatus = "Full";
                    } else if(profSensor < 700 && profSensor > 0){
                        waterStatus = "Between Border Line";
                    } else if(profSensor === 0){
                        waterStatus = "Bellow Border Line";
                    }
                });
                //-----------------------------------TEMPERATURE---------------------------------
                // This requires OneWire support using the ConfigurableFirmata
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
                        board.io.sendOneWireDelay(pin, 0);

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
                    // read the temperature now
                    //readTemperature();
                    // and every five seconds
                    setInterval(readTemperature, 1000);
                });
                //console.log(currentTemp);
                let verifyTemp = () =>{
                    console.log(currentTemp);
                    if(currentTemp >= targetTemp){
                        if(onHeater){
                            this.digitalWrite(2, 1);
                        }
                    } else{
                        if(onHeater){
                            this.digitalWrite(2, 0);
                        }
                    }
                    if(!onHeater){
                        this.digitalWrite(2, 1);
                    }
                }
                setInterval(verifyTemp, 1000);
                //---------------------------SERVO---------------------------
                let verifyFood = () =>{
                    let foodServo = new five.Servo(6);
                    if(onFood === true){
                        lastMomentFOOD = new moment();
                        lastMomentFOOD.tz("America/Sao_Paulo").format();
                    }
                    else{
                        lastMomentLED = new moment();
                        lastMomentLED.tz("America/Sao_Paulo").format();
                    }
                    //console.log(moment.duration(lastMomentFOOD.diff(firstMomentFOOD)).as("seconds"));
                    if(parseFloat(moment.duration(lastMomentFOOD.diff(firstMomentFOOD)).as("hours")) >= targetTimeFOOD){
                        foodServo.to(180, 500);
                        foodServo.to(90, 500);
                        firstMomentFOOD = new moment();
                        firstMomentFOOD.tz("America/Sao_Paulo").format();
                        lastMomentFOOD = new moment();
                        lastMomentFOOD.tz("America/Sao_Paulo").format();
                    }
                }
                setInterval(verifyFood, 1000);
                //----------------------- BOIA ------------------------------
                this.digitalRead(8, function(value) {
                    if(value === 1){
                        waterStatus = "Water Change Level";
                    } else{
                        waterStatus = "Bellow Border Line";
                    }
                    console.log(waterStatus);
                });
            });
        }
    });
    
    if (seconds < 60) {
        if (seconds < 10) {
            secStr = " 0" + seconds + "s";
        } else {
            secStr = " " + seconds + "s";
        }
    } else {
        seconds = 0;
        secStr = " 00s";
        minutes++;
    }
    if (minutes < 60) {
        if (minutes < 10) {
            minStr = " 0" + minutes + "m";
        } else {
            minStr = " " + minutes + "m";
        }
    } else {
        minutes = 0;
        minStr = " 00s";
        hours++;
    }
    if (hours < 10) {
        hourStr = "0" + hours + "h";
    } else {
        hourStr = hours + "h";
    }
        
    fullTime = hourStr + minStr + secStr;

    if (portaAtual === 'COM1' && COMs.length === 0) {
        portaAnterior = portaAtual;
        portaAtual = 'COM1';
        fullTime = 'Not Running';
    }

    io.emit('arduino:info', {
        runtimeSec: fullTime
    });

    io.emit('port:connected', {
        value: portaAtual !== 'COM1' ? portaAtual : null
    });
    seconds++;
}, 1000);


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

app.get('/get-led-info', function(req, res){
    const ledInfo = {
        ledPer: (strengthLED*100/255),
        ledStatus: onLED
      }
    res.send(JSON.stringify(ledInfo));
});

app.post("/manual-led-controll", function(req, res){
    try {
        if (req.body.ledon || req.body.ledoff || req.body.ledstrh || req.body.ledmode || req.body.ledcicle) {
            if (portaAtual !== null) {
                if (req.body.ledon){
                    onLED = true;
                    res.send("Light is ON!");
                } 
                if (req.body.ledoff){
                    onLED = false;
                    res.send("Light is OFF!");
                } 
                if(req.body.ledstrh){
                    modeLED = 'manual';
                    strengthLED = req.body.ledstrh;
                    res.send("Light Strength: " + req.body.ledstrh);
                }
                if(req.body.ledmode){
                    modeLED = 'auto';
                    res.send("LED MODE: " + req.body.ledmode);
                }
                if(req.body.ledcicle){
                    firstMomentLED = new moment();
                    lastMomentLED = new moment();
                    targetTimeLED = parseFloat(req.body.ledcicle);
                    res.send("Cicle Time is: " + req.body.ledcicle + " hours");
                }
            }
        }
    } catch (error) {
        res.status(500).json(error);
    }
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

app.post("/manual-food-controll", function(req, res){
    try {
        if (req.body.foodon || req.body.foodoff || req.body.targetfoodtime || req.body.defaultfoodtime) {
            if (portaAtual !== null) {
                if (req.body.foodon){
                    onFood = true;
                    res.send("Heater is ON!");
                } 
                if (req.body.foodon){
                    onFood = false;
                    res.send("Heater is OFF!");
                } 
                if(req.body.targetfoodtime){
                    targetTimeFOOD = parseFloat(req.body.targetfoodtime);
                    firstMomentFOOD = new moment();
                    firstMomentFOOD.tz("America/Sao_Paulo").format();
                    lastMomentFOOD = new moment();
                    lastMomentFOOD.tz("America/Sao_Paulo").format();
                    res.send("Food Time Target now is: " + req.body.targetfoodtime + "h");
                }
                if(req.body.defaultfoodtime){
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