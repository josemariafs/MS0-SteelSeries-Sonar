/// <reference path="./utils/common.js" />
/// <reference path="./utils/axios.js" />
/// <reference path="./utils/worker.js" />

const $SD = window.$SD || window.connectElgatoStreamDeckSocket();
const plugin = new Plugins("Dials Volume Mixer");
let ggEncryptedAddress = ''
let webServerAddress = '';
let sonarMode = '';
let volumeData = '';
//////////////////////////////////////////////////

async function getFromDom() {

    const data = $SD.api.getInfo();
    console.log("Data from plugin:", data);
    if (data && data.mixerSelected && data.sonarMode && data.outputSelected) {
        console.log("Values received from plugin:", data);
        return {
            mixerSelected: data.mixerSelected,
            sonarMode: data.sonarMode,
            outputSelected: data.outputSelected
        };
    }
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
      console.log("ggEncryptedAddress:", ggEncryptedAddress);
  
      let subAppsData = await getFetch(
        "https://" + ggEncryptedAddress + "/subApps"
      );
      console.log("subAppsData:", subAppsData);
  
      webServerAddress = subAppsData.subApps.sonar.metadata.webServerAddress;
  
      console.log("webServerAddress:", webServerAddress);
  
      sonarMode = await getFetch(webServerAddress + "/mode/");
      console.log("sonarMode:", sonarMode);
  
      if (sonarMode === "stream"){
          sonarMode = "streamer";
      }
  
      volumeData = await getFetch(
        webServerAddress + "/volumeSettings/" + sonarMode
      );
  
      console.log("volumeData:", volumeData);
  
      that.self.postMessage({
        event: "fileContent",
        data: data,
      });
    })
    .catch((error) => {
      console.error("Error reading file:", error);
      that.self.postMessage({
        event: "fileError",
        error: error.message,
      });
    });
//////////////////////////////////////////////////

plugin.action1 = new Actions({
    default: {},
    async _willAppear({ context, payload }) {
        let count = 0;
        if ("count" in payload.settings) {
            count = payload.settings.count;
        } else {
            window.socket.setSettings(context, { count: count });
        }
        window.socket.setTitle(context, count + '');
    },
    _willDisappear() { },
    async keyUp(data) {
        let count = data.payload.settings.count + 1;
        window.socket.setSettings(data.context, { count: count })
        window.socket.setTitle(data.context, count + '');
    },
    async dialRotate(data) {
        console.log(data);
        
        let dataFromPlugin = getFromDom();
        let outputSelected = dataFromPlugin[2];
        let sonarMode = dataFromPlugin[1];
        let mixerSelected = dataFromPlugin[0];

        if (dataFromPlugin === "masters") {
            mixerSelected = "master";
        }             
        volumeData = await getFetch(webServerAddress + "/volumeSettings/" + sonarMode);


       switch (mixerSelected) {
            case 'masters':
                    if (sonarMode === 'streamer') {
                        volumeData = volumeData.masters.streamer.volume;
                    }else{
                        volumeData = volumeData.masters.classic.volume;
                    }
                break;

                case 'aux':
                    if (sonarMode === 'streamer') {
                        volumeData = volumeData.aux.streamer.volume;
                    }else{
                        volumeData = volumeData.aux.classic.volume;
                    }
                break;

                case 'chatRender':
                    if (sonarMode === 'streamer') {
                        volumeData = volumeData.chatRender.streamer.volume;
                    }else{
                        volumeData = volumeData.chatRender.classic.volume;
                    }
                break;
                
                case 'game':
                    if (sonarMode === 'streamer') {
                        volumeData = volumeData.game.streamer.volume;
                    }else{
                        volumeData = volumeData.game.classic.volume;
                    }
                break;
                
                case 'media':
                    if (sonarMode === 'streamer') {
                        volumeData = volumeData.media.streamer.volume;
                    }else{
                        volumeData = volumeData.media.classic.volume;
                    }
                break;            
       }
        

        switch (data.event) {
            case 'dialRotate':
                if (data.payload.ticks > 0) {
                    console.log("valor inicial");
                    console.log(volumeData * 100 +"%");
                    let aux = volumeData + 0.05;
                    setPut(webServerAddress + '/volumeSettings/'+sonarMode+'/'+mixerSelected+'/Volume/'+JSON.stringify(aux));
                }else{
                    console.log("valor inicial");
                    console.log(volumeData * 100 +"%");
                    let aux = volumeData - 0.05;
                    setPut(webServerAddress + '/volumeSettings/'+sonarMode+'/'+mixerSelected+'/Volume/'+JSON.stringify(aux));
                }
                break;
            case  'dialDown':
                console.log("Muteo volumen");
                break;
            }
    },
    async dialDown(data) {
        console.log(data);
    }
});