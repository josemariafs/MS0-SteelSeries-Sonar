/// <reference path="./utils/common.js" />
/// <reference path="./utils/axios.js" />
/// <reference path="./utils/worker.js" />



const plugin = new Plugins("Dials Volume Mixer");
let ggEncryptedAddress = ''
let webServerAddress = '';
let sonarMode = '';
let volumeDataMaster = '';
let prevVolumeDataMaster = '';

let volumeDataGame = '';
let prevVolumeDataGame = '';

let volumeDataChat = '';
let prevVolumeDataChat = '';

let volumeDataMedia = '';
let prevVolumeDataMedia = '';

let volumeDataAux = '';
let prevVolumeDataAux = '';

let volumeDataAuxMedia = '';
let prevVolumeDataAuxMedia = '';

let alignRight = "          "

//////////////////////////////////////////////////
 
async function getFetch(url) {
    try {
      const response = await fetch(url).then((response) => response.json());
      return response;
    } catch (error) {
      console.error("Error in getFetch:", error);
      throw error;
    }
  }

async function setPut(url){
  fetch(url, {
    method: 'PUT',
    headers: {
        'Content-Type': 'application/json'
    },
});
}

// Modificar la función updateAllVolumes para también actualizar la interfaz
async function updateAllVolumes() {
    try {
        volumeData = await getFetch(webServerAddress + "/volumeSettings/" + sonarMode);
        
        if (sonarMode === 'streamer') {
            volumeDataMaster = volumeData.masters.streamer.volume;
            volumeDataGame = volumeData.devices.game.streamer.volume;
            volumeDataChat = volumeData.devices.chatRender.streamer.volume;
            volumeDataMedia = volumeData.devices.media.streamer.volume;
            volumeDataAux = volumeData.devices.aux.streamer.volume;
        } else {
            volumeDataMaster = volumeData.masters.classic.volume;
            volumeDataGame = volumeData.devices.game.classic.volume;
            volumeDataChat = volumeData.devices.chatRender.classic.volume;
            volumeDataMedia = volumeData.devices.media.classic.volume;
            volumeDataAux = volumeData.devices.aux.classic.volume;
        }

        // Actualizar la interfaz para todos los controles activos
        updateDisplays();
    } catch (error) {
        console.error("Error updating volumes:", error);
    }
}

// Nueva función para actualizar las pantallas de todos los controles
function updateDisplays() {
    // Actualizar Master
    if (plugin.masterAction.contextList && plugin.masterAction.contextList.length > 0) {
        plugin.masterAction.contextList.forEach(context => {
            window.socket.setTitle(context, alignRight + parseInt(volumeDataMaster * 100) + "%");
        });
    }
    
    // Actualizar Game
    if (plugin.gameAction.contextList && plugin.gameAction.contextList.length > 0) {
        plugin.gameAction.contextList.forEach(context => {
            window.socket.setTitle(context, alignRight + parseInt(volumeDataGame * 100) + "%");
        });
    }
    
    // Actualizar Chat
    if (plugin.chatAction.contextList && plugin.chatAction.contextList.length > 0) {
        plugin.chatAction.contextList.forEach(context => {
            window.socket.setTitle(context, alignRight + parseInt(volumeDataChat * 100) + "%");
        });
    }
    
    // Actualizar Media
    if (plugin.mediaAction.contextList && plugin.mediaAction.contextList.length > 0) {
        plugin.mediaAction.contextList.forEach(context => {
            window.socket.setTitle(context, alignRight + parseInt(volumeDataMedia * 100) + "%");
        });
    }
    
    // Actualizar Aux
    if (plugin.auxAction.contextList && plugin.auxAction.contextList.length > 0) {
        plugin.auxAction.contextList.forEach(context => {
            window.socket.setTitle(context, alignRight + parseInt(volumeDataAux * 100) + "%");
        });
    }
    
    // Actualizar AuxMedia
    if (plugin.auxMediaAction.contextList && plugin.auxMediaAction.contextList.length > 0) {
        plugin.auxMediaAction.contextList.forEach(context => {
            window.socket.setTitle(context, parseInt(volumeDataAux * 100) + "%" + " / " + parseInt(volumeDataMedia * 100) + "%");
        });
    }
}

// Modificar la parte del fetch inicial para usar updateAllVolumes en lugar de las actualizaciones manuales
fetch("file:///C:/ProgramData/SteelSeries/SteelSeries%20Engine%203/coreProps.json")
    .then((response) => response.json())
    .then(async (data) => {
        ggEncryptedAddress = data.ggEncryptedAddress;
        let subAppsData = await getFetch("https://" + ggEncryptedAddress + "/subApps");
        webServerAddress = subAppsData.subApps.sonar.metadata.webServerAddress;
        sonarMode = await getFetch(webServerAddress + "/mode/");
        
        if (sonarMode === "stream") {
            sonarMode = "streamer";
        }
        
        // Actualizar volúmenes iniciales y mostrarlos en pantalla
        await updateAllVolumes();
    })
    .catch((error) => {
        console.error("Error reading file:", error);
    });

//////////////////////////////////////////////////////////////////
////////////////////////    MASTER      //////////////////////////
//////////////////////////////////////////////////////////////////

plugin.masterAction = new Actions({
    default: {},
    async _willAppear({ context, payload }) {
        try {
            volumeData = await getFetch(webServerAddress + "/volumeSettings/" + sonarMode);
            if (sonarMode === 'streamer') {
                volumeDataMaster = volumeData.masters.streamer.volume;
            } else {
                volumeDataMaster = volumeData.masters.classic.volume;
            }
            window.socket.setTitle(context, alignRight + parseInt(volumeDataMaster * 100) + "%");
        } catch (error) {
            console.error("Error on connect:", error);
        }
    },

    async dialRotate(data) {
        let mixerSelected = 'master';
        volumeData = await getFetch(webServerAddress + "/volumeSettings/" + sonarMode);
        console.log(108)
        console.log(volumeData)
        if (sonarMode === 'streamer') {
            volumeDataMaster = volumeData.masters.streamer.volume;
        }else{
            volumeDataMaster = volumeData.masters.classic.volume;
        }       


        switch (data.event) {
            case 'dialRotate':
                if (data.payload.ticks > 0) {
                    let aux = volumeDataMaster + 0.05;
                    console.log(124)
                    console.log(aux)
                    if (aux > 1){
                        aux = 1;
                    }
                    setPut(webServerAddress + '/volumeSettings/'+sonarMode+'/'+mixerSelected+'/Volume/'+JSON.stringify(aux));
                    window.socket.setTitle(data.context, alignRight+parseInt(aux * 100) +"%");
                }else{
                    let aux = volumeDataMaster - 0.05;
                    if (aux < 0){
                        aux = 0;
                    }
                    setPut(webServerAddress + '/volumeSettings/'+sonarMode+'/'+mixerSelected+'/Volume/'+JSON.stringify(aux));
                    window.socket.setTitle(data.context, alignRight+parseInt(aux * 100) +"%");
                }
                break;
            }
    },
    async dialDown(data) {
        let mixerSelected = 'master';

        if (volumeDataMaster === 0){
            volumeDataMaster = prevVolumeDataMaster
            window.socket.setTitle(data.context, alignRight+parseInt(volumeDataMaster * 100) +"%");

        }else{
            prevVolumeDataMaster = volumeDataMaster;
            volumeDataMaster = 0;
            window.socket.setTitle(data.context, alignRight+"MUTED");

        }
        setPut(webServerAddress + '/volumeSettings/'+sonarMode+'/'+mixerSelected+'/Volume/'+JSON.stringify(volumeDataMaster));
    }
});


//////////////////////////////////////////////////////////////////
////////////////////////      GAME      //////////////////////////
//////////////////////////////////////////////////////////////////

plugin.gameAction = new Actions({
    default: {},
    async _willAppear({ context, payload }) {
        try {
            volumeData = await getFetch(webServerAddress + "/volumeSettings/" + sonarMode);
            if (sonarMode === 'streamer') {
                volumeDataGame = volumeData.devices.game.streamer.volume;
            }else{
                volumeDataGame = volumeData.devices.game.classic.volume;
            }    
            const layout = "$B1"

            window.socket.setFeedbackLayout(context,layout); 
            window.socket.setTitle(context, alignRight + parseInt(volumeDataGame * 100) + "%");
        } catch (error) {
            console.error("Error on connect:", error);
        }

    },
    async dialRotate(data) {
        let mixerSelected = 'game';
        volumeData = await getFetch(webServerAddress + "/volumeSettings/" + sonarMode);
        if (sonarMode === 'streamer') {
            volumeDataGame = volumeData.devices.game.streamer.volume;
        }else{
            volumeDataGame = volumeData.devices.game.classic.volume;
        }       


        switch (data.event) {
            case 'dialRotate':
                if (data.payload.ticks > 0) {
                    let aux = volumeDataGame + 0.05;
                    if (aux > 1){
                        aux = 1;
                    }
                    setPut(webServerAddress + '/volumeSettings/'+sonarMode+'/'+mixerSelected+'/Volume/'+JSON.stringify(aux));
                    window.socket.setTitle(data.context, alignRight+parseInt(aux * 100) +"%");
                }else{
                    let aux = volumeDataGame - 0.05;
                    if (aux < 0){
                        aux = 0;
                    }
                    setPut(webServerAddress + '/volumeSettings/'+sonarMode+'/'+mixerSelected+'/Volume/'+JSON.stringify(aux));
                    window.socket.setTitle(data.context, alignRight+parseInt(aux * 100) +"%");
                }
                break;
            }
    },
    async dialDown(data) {
        let mixerSelected = 'game';

        if (volumeDataGame === 0){
            volumeDataGame = prevVolumeDataGame
            window.socket.setTitle(data.context, alignRight+parseInt(volumeDataGame * 100) +"%");

        }else{
            prevVolumeDataGame = volumeDataGame;
            volumeDataGame = 0;
            window.socket.setTitle(data.context, alignRight+"MUTED");

        }
        setPut(webServerAddress + '/volumeSettings/'+sonarMode+'/'+mixerSelected+'/Volume/'+JSON.stringify(volumeDataGame));
    }
});

//////////////////////////////////////////////////////////////////
////////////////////////      CHAT      //////////////////////////
//////////////////////////////////////////////////////////////////

plugin.chatAction = new Actions({
    default: {},
    async _willAppear({ context, payload }) {
        try {
            volumeData = await getFetch(webServerAddress + "/volumeSettings/" + sonarMode);
            if (sonarMode === 'streamer') {
                volumeDataChat = volumeData.devices.chatRender.streamer.volume;
            }else{
                volumeDataChat = volumeData.devices.chatRender.classic.volume;
            }      
            window.socket.setTitle(context, alignRight + parseInt(volumeDataChat * 100) + "%");
        } catch (error) {
            console.error("Error on connect:", error);
        }
    },
    async dialRotate(data) {
        let mixerSelected = 'chatRender';
        volumeData = await getFetch(webServerAddress + "/volumeSettings/" + sonarMode);
        console.log(volumeData)
        if (sonarMode === 'streamer') {
            volumeDataChat = volumeData.devices.chatRender.streamer.volume;
        }else{
            volumeDataChat = volumeData.devices.chatRender.classic.volume;
        }       


        switch (data.event) {
            case 'dialRotate':
                if (data.payload.ticks > 0) {
                    let aux = volumeDataChat + 0.05;
                    if (aux > 1){
                        aux = 1;
                    }
                    setPut(webServerAddress + '/volumeSettings/'+sonarMode+'/'+mixerSelected+'/Volume/'+JSON.stringify(aux));
                    window.socket.setTitle(data.context, alignRight+parseInt(aux * 100) +"%");
                }else{
                    let aux = volumeDataChat - 0.05;
                    if (aux < 0){
                        aux = 0;
                    }
                    setPut(webServerAddress + '/volumeSettings/'+sonarMode+'/'+mixerSelected+'/Volume/'+JSON.stringify(aux));
                    window.socket.setTitle(data.context, alignRight+parseInt(aux * 100) +"%");
                }
                break;
            }
    },
    async dialDown(data) {
        console.log("Dial down chat");
        console.log(data);
        let mixerSelected = 'chatRender'; // Cambiado de 'chat' a 'chatRender'

        if (volumeDataChat === 0){
            volumeDataChat = prevVolumeDataChat
            window.socket.setTitle(data.context, alignRight+parseInt(volumeDataChat * 100) +"%");

        }else{
            prevVolumeDataChat = volumeDataChat;
            volumeDataChat = 0;
            window.socket.setTitle(data.context, alignRight+"MUTED");

        }
        setPut(webServerAddress + '/volumeSettings/'+sonarMode+'/'+mixerSelected+'/Volume/'+JSON.stringify(volumeDataChat));
    }
});

//////////////////////////////////////////////////////////////////
////////////////////////     MEDIA      //////////////////////////
//////////////////////////////////////////////////////////////////

plugin.mediaAction = new Actions({
    default: {},
    async _willAppear({ context, payload }) {
        try {
            volumeData = await getFetch(webServerAddress + "/volumeSettings/" + sonarMode);
            if (sonarMode === 'streamer') {
                volumeDataMedia = volumeData.devices.media.streamer.volume;
            }else{
                volumeDataMedia = volumeData.devices.media.classic.volume;
            }    
            window.socket.setTitle(context, alignRight + parseInt(volumeDataMedia * 100) + "%");
        } catch (error) {
            console.error("Error on connect:", error);
        }
    },
    async dialRotate(data) {
        let mixerSelected = 'media';
        volumeData = await getFetch(webServerAddress + "/volumeSettings/" + sonarMode);
        console.log(volumeData)
        if (sonarMode === 'streamer') {
            volumeDataMedia = volumeData.devices.media.streamer.volume;
        }else{
            volumeDataMedia = volumeData.devices.media.classic.volume;
        }       


        switch (data.event) {
            case 'dialRotate':
                if (data.payload.ticks > 0) {
                    let aux = volumeDataMedia + 0.05;
                    if (aux > 1){
                        aux = 1;
                    }
                    setPut(webServerAddress + '/volumeSettings/'+sonarMode+'/'+mixerSelected+'/Volume/'+JSON.stringify(aux));
                    window.socket.setTitle(data.context, alignRight+parseInt(aux * 100) +"%");
                }else{
                    let aux = volumeDataMedia - 0.05;
                    if (aux < 0){
                        aux = 0;
                    }
                    setPut(webServerAddress + '/volumeSettings/'+sonarMode+'/'+mixerSelected+'/Volume/'+JSON.stringify(aux));
                    window.socket.setTitle(data.context, alignRight+parseInt(aux * 100) +"%");
                }
                break;
            }
    },
    async dialDown(data) {
        let mixerSelected = 'media';

        if (volumeDataMedia === 0){
            volumeDataMedia = prevVolumeDataMedia
            window.socket.setTitle(data.context, alignRight+parseInt(volumeDataMedia * 100) +"%");

        }else{
            prevVolumeDataMedia = volumeDataMedia;
            volumeDataMedia = 0;
            window.socket.setTitle(data.context, alignRight+"MUTED");

        }
        setPut(webServerAddress + '/volumeSettings/'+sonarMode+'/'+mixerSelected+'/Volume/'+JSON.stringify(volumeDataMedia));
    }
});

//////////////////////////////////////////////////////////////////
////////////////////////      AUX       //////////////////////////
//////////////////////////////////////////////////////////////////

plugin.auxAction = new Actions({
    default: {},
    async _willAppear({ context, payload }) {
        try {
            volumeData = await getFetch(webServerAddress + "/volumeSettings/" + sonarMode);
            if (sonarMode === 'streamer') {
                volumeDataAux = volumeData.devices.aux.streamer.volume;
            }else{
                volumeDataAux = volumeData.devices.aux.classic.volume;
            }       
            window.socket.setTitle(context, alignRight + parseInt(volumeDataAux * 100) + "%");
        } catch (error) {
            console.error("Error on connect:", error);
        }
    },
    async dialRotate(data) {
        let mixerSelected = 'aux';
        volumeData = await getFetch(webServerAddress + "/volumeSettings/" + sonarMode);
        console.log(volumeData)
        if (sonarMode === 'streamer') {
            volumeDataAux = volumeData.devices.aux.streamer.volume;
        }else{
            volumeDataAux = volumeData.devices.aux.classic.volume;
        }       


        switch (data.event) {
            case 'dialRotate':
                if (data.payload.ticks > 0) {
                    let aux = volumeDataAux + 0.05;
                    if (aux > 1){
                        aux = 1;
                    }
                    setPut(webServerAddress + '/volumeSettings/'+sonarMode+'/'+mixerSelected+'/Volume/'+JSON.stringify(aux));
                    window.socket.setTitle(data.context, alignRight+parseInt(aux * 100) +"%");
                }else{
                    let aux = volumeDataAux - 0.05;
                    if (aux < 0){
                        aux = 0;
                    }
                    setPut(webServerAddress + '/volumeSettings/'+sonarMode+'/'+mixerSelected+'/Volume/'+JSON.stringify(aux));
                    window.socket.setTitle(data.context, alignRight+parseInt(aux * 100) +"%");
                }
                break;
            }
    },
    async dialDown(data) {
        let mixerSelected = 'aux';

        if (volumeDataAux === 0){
            volumeDataAux = prevVolumeDataAux
            window.socket.setTitle(data.context, alignRight+parseInt(volumeDataAux * 100) +"%");

        }else{
            prevVolumeDataAux = volumeDataAux;
            volumeDataAux = 0;
            window.socket.setTitle(data.context, alignRight+"MUTED");

        }
        setPut(webServerAddress + '/volumeSettings/'+sonarMode+'/'+mixerSelected+'/Volume/'+JSON.stringify(volumeDataAux));
    }
});

//////////////////////////////////////////////////////////////////
///////////////////////    AUX+MEDIA    //////////////////////////
//////////////////////////////////////////////////////////////////

plugin.auxMediaAction = new Actions({
    default: {},
    async _willAppear({ context, payload }) {
        try {
            volumeData = await getFetch(webServerAddress + "/volumeSettings/" + sonarMode);
            if (sonarMode === 'streamer') {
                volumeDataAux = volumeData.devices.aux.streamer.volume;
                volumeDataMedia = volumeData.devices.media.streamer.volume;
            }else{
                volumeDataAux = volumeData.devices.aux.classic.volume;
                volumeDataMedia = volumeData.devices.media.classic.volume;
            }    
            window.socket.setTitle(data.context, parseInt(volumeDataAux * 100) +"%"+" / "+parseInt(volumeDataMedia * 100) +"%");
        } catch (error) {
            console.error("Error on connect:", error);
        }
    },
    async dialRotate(data) {
        volumeData = await getFetch(webServerAddress + "/volumeSettings/" + sonarMode);
        console.log(volumeData)
        if (sonarMode === 'streamer') {
            volumeDataAux = volumeData.devices.aux.streamer.volume;
            volumeDataMedia = volumeData.devices.media.streamer.volume;
        }else{
            volumeDataAux = volumeData.devices.aux.classic.volume;
            volumeDataMedia = volumeData.devices.media.classic.volume;
        }       


        switch (data.event) {
            case 'dialRotate':
                if (data.payload.ticks > 0) {
                    let aux = volumeDataAux + 0.05;
                    if (aux > 1){
                        aux = 1;
                    }
                    setPut(webServerAddress + '/volumeSettings/'+sonarMode+'/aux/Volume/'+JSON.stringify(aux));
                    aux = volumeDataMedia + 0.05;
                    if (aux > 1){
                        aux = 1;
                    }
                    setPut(webServerAddress + '/volumeSettings/'+sonarMode+'/media/Volume/'+JSON.stringify(aux));
                    window.socket.setTitle(data.context, parseInt(volumeDataAux * 100) +"%"+" / "+parseInt(aux * 100) +"%");
                }else{
                    let aux = volumeDataAux - 0.05;
                    if (aux < 0){
                        aux = 0;
                    }
                    setPut(webServerAddress + '/volumeSettings/'+sonarMode+'/aux/Volume/'+JSON.stringify(aux));
                    aux = volumeDataMedia - 0.05;
                    if (aux < 0){
                        aux = 0;
                    }
                    setPut(webServerAddress + '/volumeSettings/'+sonarMode+'/media/Volume/'+JSON.stringify(aux));
                    window.socket.setTitle(data.context, parseInt(volumeDataAux * 100) +"%"+" / "+parseInt(aux * 100) +"%");
                }
                break;
            }
    },
    async dialDown(data) {

        if (volumeDataAux === 0){
            volumeDataAux = prevVolumeDataAux
            window.socket.setTitle(data.context, parseInt(volumeDataAux * 100) +"%"+" / "+parseInt(volumeDataMedia * 100) +"%");

        }else{
            prevVolumeDataAux = volumeDataAux;
            volumeDataAux = 0;
            window.socket.setTitle(data.context, "MUTED");

        }

        if (volumeDataMedia === 0){
            volumeDataMedia = prevVolumeDataMedia
            window.socket.setTitle(data.context, parseInt(volumeDataAux * 100) +"%"+" / "+parseInt(volumeDataMedia * 100) +"%");

        }else{
            prevVolumeDataMedia = volumeDataMedia;
            volumeDataMedia = 0;
            window.socket.setTitle(data.context, "MUTED");

        }
        setPut(webServerAddress + '/volumeSettings/'+sonarMode+'/mixer/Volume/'+JSON.stringify(volumeDataAux));
        setPut(webServerAddress + '/volumeSettings/'+sonarMode+'/media/Volume/'+JSON.stringify(volumeDataMedia));
    }
});