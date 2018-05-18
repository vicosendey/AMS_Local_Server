const socket = io();
let selectedPort = null;

const postExmple = {
    status: 'port@COM3 || working@yes'
}

socket.on('port:connected', function(data){
    if(data.value !== null){
        document.getElementById('serialPort').textContent = data.value;
        document.getElementById('working').textContent = "Yes";
    } else{
        document.getElementById('serialPort').textContent = "Not Connected";
        document.getElementById('working').textContent = "No";
    }
    
});

socket.on('arduino:info', function(data){
    if(data.runtimeSec !== undefined){
        document.getElementById('time').textContent = data.runtimeSec;
    } else{
        document.getElementById('time').textContent = "data.runtimeSec";
    }
    document.getElementById('time').textContent = data.runtimeSec;
});

socket.on('ports:data', function(data){
    const select = document.getElementById("select");
    document.getElementById('select').innerHTML = "";
    data.value.forEach(function(dt){
        const option = document.createElement("option");
        option.text = dt;
        option.setAttribute('id', 'option');
        select.add(option);
    });
    if(selectedPort !== null){
        document.getElementById('select').value = selectedPort;
    }
});