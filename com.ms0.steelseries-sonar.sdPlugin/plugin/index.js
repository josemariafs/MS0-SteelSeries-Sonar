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


//////////////////////////////////////////////////
 
const action = {
    onSendToPlugin: (jsonObj) => {
        console.log(`[onSendToPlugin] ${JSON.stringify(jsonObj)}`);
        if(jsonObj.payload) {
            console.log("jsonObj.payload", jsonObj.payload);
            $SD.api.setSettings(jsonObj.context, jsonObj.payload);
        }
    },
}

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



fetch(
    "file:///C:/ProgramData/SteelSeries/SteelSeries%20Engine%203/coreProps.json"
  )
    .then((response) => response.json())
    .then(async (data) => {

      ggEncryptedAddress = data.ggEncryptedAddress;

      let subAppsData = await getFetch(
        "https://" + ggEncryptedAddress + "/subApps"
      );
  
      webServerAddress = subAppsData.subApps.sonar.metadata.webServerAddress;
      sonarMode = await getFetch(webServerAddress + "/mode/");
  
      if (sonarMode === "stream"){
          sonarMode = "streamer";
      }
  
      volumeData = await getFetch(
        webServerAddress + "/volumeSettings/" + sonarMode
      );
  
    })
    .catch((error) => {
      console.error("Error reading file:", error);

    });
//////////////////////////////////////////////////

plugin.masterAction = new Actions({
    default: {},
    async dialRotate(data) {
        let mixerSelected = 'master';
        volumeData = await getFetch(webServerAddress + "/volumeSettings/" + sonarMode);
        if (sonarMode === 'streamer') {
            volumeDataMaster = volumeData.masters.streamer.volume;
        }else{
            volumeDataMaster = volumeData.masters.classic.volume;
        }       


        switch (data.event) {
            case 'dialRotate':
                if (data.payload.ticks > 0) {
                    let aux = volumeDataMaster + 0.05;
                    if (aux > 1){
                        aux = 1;
                    }
                    setPut(webServerAddress + '/volumeSettings/'+sonarMode+'/'+mixerSelected+'/Volume/'+JSON.stringify(aux));
                    window.socket.setTitle(data.context, parseInt(volumeDataMaster * 100) +"%");
                }else{
                    let aux = volumeDataMaster - 0.05;
                    if (aux < 0){
                        aux = 0;
                    }
                    setPut(webServerAddress + '/volumeSettings/'+sonarMode+'/'+mixerSelected+'/Volume/'+JSON.stringify(aux));
                    window.socket.setTitle(data.context, parseInt(volumeDataMaster * 100) +"%");
                }
                break;
            }
    },
    async dialDown(data) {
        let mixerSelected = 'master';

        if (volumeDataMaster === 0){
            volumeDataMaster = prevVolumeDataMaster
            window.socket.setTitle(data.context, parseInt(volumeDataMaster * 100) +"%");

        }else{
            prevVolumeDataMaster = volumeDataMaster;
            volumeDataMaster = 0;
            window.socket.setTitle(data.context, "Muteao");

        }
        setPut(webServerAddress + '/volumeSettings/'+sonarMode+'/'+mixerSelected+'/Volume/'+JSON.stringify(volumeDataMaster));
    }
});


//////////////////////////////////////////////////

plugin.gameAction = new Actions({
    default: {},
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
                    window.socket.setTitle(data.context, parseInt(volumeDataGame * 100) +"%");
                }else{
                    let aux = volumeDataGame - 0.05;
                    if (aux < 0){
                        aux = 0;
                    }
                    setPut(webServerAddress + '/volumeSettings/'+sonarMode+'/'+mixerSelected+'/Volume/'+JSON.stringify(aux));
                    window.socket.setTitle(data.context, parseInt(volumeDataGame * 100) +"%");
                }
                break;
            }
    },
    async dialDown(data) {
        let mixerSelected = 'game';

        if (volumeDataGame === 0){
            volumeDataGame = prevVolumeDataGame
            window.socket.setTitle(data.context, parseInt(volumeDataGame * 100) +"%");

        }else{
            prevVolumeDataGame = volumeDataGame;
            volumeDataGame = 0;
            window.socket.setTitle(data.context, "Muteao");

        }
        setPut(webServerAddress + '/volumeSettings/'+sonarMode+'/'+mixerSelected+'/Volume/'+JSON.stringify(volumeDataGame));
    }
});