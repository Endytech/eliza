module.exports = {
    port: 3100,
    processFile: 'runningProcesses.json', // File to store running process information
    appDataFile: 'appdata.json', // File to store app times, data
    notifyPeriod: 60, // Minutes
    brnHost: 'https://api.brn.ai',
    brnAccessToken: '',
    botNotifierId:'',
    needNotifyErrorsByBotNotifier: false,
    errMsgKeeplength: 1200,
    errMsgMaxlength: 5000
};
