const that = this,
  Timer = {};

async function getFetch(url) {
  try {
    const response = await fetch(url).then((response) => response.json());
    return response;
  } catch (error) {
    console.error("Error in getFetch:", error);
    throw error;
  }
}

const handle = {
  setTimeout(data) {
    Timer[data.id] = setTimeout(() => {
      that.self.postMessage({
        event: "setTimeout",
        id: data.id,
      });
    }, data.delay);
  },
  setInterval(data) {
    Timer[data.id] = setInterval(() => {
      that.self.postMessage({
        event: "setInterval",
        id: data.id,
      });
    }, data.delay);
  },
  clearTimeout(data) {
    clearTimeout(Timer[data.id]);
  },
  clearInterval(data) {
    clearInterval(Timer[data.id]);
  },
};

this.self.onmessage = function ({ data }) {
  handle[data?.event]?.(data);
};

fetch(
  "file:///C:/ProgramData/SteelSeries/SteelSeries%20Engine%203/coreProps.json"
)
  .then((response) => response.json())
  .then(async (data) => {
    let ggEncryptedAddress = data.ggEncryptedAddress;
    console.log("ggEncryptedAddress:", ggEncryptedAddress);

    let subAppsData = await getFetch(
      "https://" + ggEncryptedAddress + "/subApps"
    );
    console.log("subAppsData:", subAppsData);

    let webServerAddress = subAppsData.subApps.sonar.metadata.webServerAddress;

    console.log("webServerAddress:", webServerAddress);

    let sonarMode = await getFetch(webServerAddress + "/mode/");
    console.log("sonarMode:", sonarMode);

    if (sonarMode === "stream"){
        sonarMode = "streamer";
    }

    let volumeData = await getFetch(
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

function getFromDom() {
  let mixerSelected = document.getElementById("output-mixer").value;
  let sonarMode = document.getElementById("sonar-mode").value;
  let outputSelected = document.getElementById("output-device").value;

  console.log("Mixer selected:", mixerSelected);
  console.log("Sonar mode selected:", sonarMode);
  console.log("Output selected:", outputSelected);

  // Send data to the Stream Deck plugin
  $SD.api.sendToPlugin({
    mixerSelected: mixerSelected,
    sonarMode: sonarMode,
    outputSelected: outputSelected
  });




  return ({ mixerSelected, sonarMode, outputSelected });
}
