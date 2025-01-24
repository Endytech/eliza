import express from 'express';
import fs from 'fs';
import * as path from 'path';
import bodyParser from 'body-parser';
import common_config from './_config';
import readline from 'readline';
import pm2 from 'pm2';
import got from 'got';

const app = express();
const { port } = common_config;
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});
app.use(bodyParser.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ extended: false }));

// Start character
app.get('/character/start', StartCharacter);
// Stop character
app.get('/character/stop', StopCharacter);
// Run character list
app.get('/character/runlist', RunList);
// View character log
app.get('/character/log', LogViewStream);
// View character log errors
app.get('/character/errors', CharacterLogErrors);
// To test notification messages
app.get('/character/errors-notify', CharacterNotifyErrors);
// Create character
app.post('/character', CreateCharacter);
// Update character
app.put('/character', UpdateCharacter);
// Delete character
app.delete('/character', DeleteCharacter);
// Characters list
app.get('/characters', CharacterList);
// Get Character
app.get('/character', CharacterView);


async function CharacterNotifyErrors(request, response) {
    try {
        const { query: { character, needNotifyErrorsByBotNotifier, time_ago, errmsg_keeplength, errmsg_maxlength } } = request;
        const { notifyPeriod } = common_config;
        // In minutes
        const time = time_ago || notifyPeriod || 60;
        const errMsgKeepLength = errmsg_keeplength || 1200;
        const errMsgMaxLength = errmsg_maxlength || 5000;
        let runningProcesses = await ReadRunningProcessesPm2();
        if (character) runningProcesses = runningProcesses.filter((runningCharacter) => (runningCharacter.name === character));
        const errors = [];
        const totalErrors = []
        for (const runningCharacter of runningProcesses) {
            const logPath = runningCharacter.log_file;
            if (fs.existsSync(logPath)) {
                let characterErrors = await LogErrors(logPath, errMsgKeepLength, errMsgMaxLength);
                characterErrors.reverse();
                characterErrors = characterErrors.filter((error) => {
                    let date = null;
                    if (typeof error === 'string') {
                        // Extract timestamp for string errors
                        const match = error.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
                        date = match ? new Date(match[0]) : null;
                    } else if (Array.isArray(error)) {
                        // Extract timestamp for array errors
                        const match = error.find(item => /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/.test(item));
                        date = match ? new Date(match.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/)[0]) : null;
                    }
                    // Check if date is valid and within the last 60 minutes
                    return date && (Date.now() - date.getTime() <= time * 60 * 1000);
                });
                errors.push({
                    character: runningCharacter.name,
                    errors: characterErrors
                })
                if (needNotifyErrorsByBotNotifier && characterErrors.length > 0) await sendToBotNotifier(`_____________________\nCharacter: ${runningCharacter.name}\n\n${characterErrors.join('\n\n')}`);
            } else throw new Error(`Lof file not found: ${logPath}`);
        }
        // Notify about total errors for each character
        for (const errorItem of errors) {
            if (errorItem.errors.length > 0) totalErrors.push(`Character: ${errorItem.character}\nTotal errors count: ${errorItem.errors.length}\n_____________________`);
        }
        if (needNotifyErrorsByBotNotifier && totalErrors.length > 0) {
            await new Promise((resolve) => setTimeout(resolve, 2000 * 60 * 1000));
            await sendToBotNotifier(totalErrors.join("\n"));
        }

        if (response){
            if (character) {
                response.json({ status: true, errors: errors[0].errors });
            } else {
                response.json({ status: true, characters: errors, total: totalErrors });
            }
        }
    } catch (error) {
        throw new Error(`Error get error log in notify loop: ${error.message}`);
    }
}

async function autoCharacterNotifyErrors() {
    let { notifyPeriod, needNotifyErrorsByBotNotifier, errMsgKeeplength: errmsg_keeplength, errMsgMaxlength: errmsg_maxlength, appDataFile } = common_config;
    notifyPeriod = notifyPeriod || 60;
    if (needNotifyErrorsByBotNotifier) {
        try {
            const appData = ReadJsonFile(appDataFile);
            if (appData?.notifyLastTime) {
                const notifyLastTime = new Date(appData.notifyLastTime);
                const elapsed = new Date() - notifyLastTime;
                if (elapsed < notifyPeriod * 60 * 1000) {
                    const waitTime = notifyPeriod * 60 * 1000 - elapsed;
                    await new Promise((resolve) => setTimeout(resolve, waitTime));
                }
            }
        } catch (error) {
            console.error(`${new Date().toISOString()}. Error get pause before notification loop start: ${error}`);
        }
        while (true) {
            try {
                await CharacterNotifyErrors({ query: { needNotifyErrorsByBotNotifier, errmsg_keeplength, errmsg_maxlength } });
            const appData = ReadJsonFile(appDataFile);
            appData.notifyLastTime = new Date().toISOString();
            WriteJsonFile(appDataFile, appData);
            } catch (error) {
                console.error(`${new Date().toISOString()}. Error during notification loop: ${error}`);
            }
            // Wait for the notify period before the next iteration
            await new Promise((resolve) => setTimeout(resolve, notifyPeriod * 60 * 1000));
        }
    }
}
autoCharacterNotifyErrors();

async function StartCharacter(request, response) {
    try {
        const { query: { character, restart, debug } } = request;
        if (!character || typeof character !== 'string') throw new Error("Character must be string.");
        const characterPath = `characters/${character}.character.json`;

        const isRestart = restart === 'true' || restart === '1' || false;
        const isDebug = debug === 'true' || debug === '1' || false;

        const rootDir = path.resolve('../');
        const logsDir = path.join(rootDir, 'logs');
        const logFile = path.join(logsDir, `logs_${character}_${new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_')}.txt`);
        // Ensure the logs directory exists
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir);
        }
        // Check if character file does not exists
        const existCharacters = await GetCharacterList();
        if (!existCharacters.includes(character)) throw new Error(`Character ${character} does not exists`);
        // Check if process for this character is already running
        const runningProcesses = await ReadRunningProcessesPm2();
        const runningCharacter = runningProcesses.find((runCharacter) => (runCharacter.name === character));
        // Connect to pm2
        await new Promise((resolve, reject) => pm2.connect((err) => (err ? reject(new Error(`Error connecting to PM2: ${err.message}`)) : resolve())));
        if (runningCharacter) {
            if (isRestart) {
                // Delete the existing process
                await new Promise((resolve, reject) => pm2.delete(runningCharacter.name,(err)=>
                    (err ? reject(new Error(`Error deleting Eliza process PM2 with name: "${runningCharacter.name}": ${err.message}`)) : resolve())));
                // WriteJsonFile(runningProcesses);
            } else {
                return response.status(400).json({ error: `Eliza is already running for character: ${character}` });
            }
        }
        const apps = await new Promise((resolve, reject) => pm2.start({
            name: character, // PM2 process name
            script: 'pnpm',
            args: [`start${isDebug ? ':debug' : ''}`, `--characters=${characterPath}`],
            cwd: rootDir, // Set current directory for execution
            // log_file: logFile, // Direct output to a log file
            output: logFile, // Redirect stdout to log file
            error: logFile, // Redirect stderr to log file
        },(err, apps) => (err ? reject(new Error(`Error starting Eliza process PM2 with name: "${character}": ${err.message}`)) : resolve(apps))));
        // console.log(`apps`, JSON.stringify(apps, null, 4));
        if (!apps || apps.length === 0) {
            pm2.disconnect();
            throw new Error(`Error on start Eliza process PM2 with name: ${character}`);
        }
        // runningProcesses[character] = { pid: apps[0].pid, pm_id: apps[0].pm2_env.pm_id, name: character, log_file: logFile, character_path: characterPathFull };
        // WriteJsonFile(runningProcesses);
        console.log(`${new Date().toISOString()}. Character started. Name: ${character}. Id: ${apps[0].pm2_env.pm_id}`);
        pm2.disconnect(); // Disconnect from PM2 when done
        response.json({ status: true, pid: apps[0].pid, pm_id: apps[0].pm2_env.pm_id, character, log_file: logFile, character_path: characterPath });
    } catch (error) {
        response.status(400).json({
            status: false,
            error: error.message,
        });
    }
}

async function StopCharacter(request, response) {
    try {
        const { query: { character } } = request;
        if (!character || typeof character !== 'string') throw new Error("Character must be string.");

        const runningProcesses = await ReadRunningProcessesPm2();
        const runningCharacter = runningProcesses.find((runCharacter) => (runCharacter.name === character));
        if (!runningCharacter) throw new Error(`No running process found for character: ${character}`);
        await new Promise((resolve, reject) => pm2.connect((err) => (err ? reject(new Error(`Error connecting to PM2: ${err.message}`)) : resolve())));
        await new Promise((resolve, reject) => pm2.delete(runningCharacter.name,(err)=>
            (err ? reject(new Error(`Error stop Eliza process PM2 with name: "${runningCharacter.name}": ${err.message}`)) : resolve())));
        console.log(`${new Date().toISOString()}. Character stopped. Name: ${runningCharacter.name}. Id: ${runningCharacter.pm_id}.`);
        // WriteJsonFile(runningProcesses);
        pm2.disconnect();
        response.json({ status: true });
    } catch (error) {
        response.status(400).json({
            status: false,
            error: error.message,
        });
    }
}

async function RunList(request, response) {
    try {
        const list = await ReadRunningProcessesPm2();
        response.json({ status: true,  characters: list });
    } catch (error) {
        response.status(400).json({
            status: false,
            error: error.message,
        });
    }
}

async function CreateCharacter(request, response, update = false) {
    try{
        const {  query: { character }, body: { data } } = request;
        if (!data || typeof data !== 'object') throw new Error("Data must be a JSON object.");
        if (!character || typeof character !== 'string') throw new Error("Character must be string.");
        const existCharacters = await GetCharacterList();
        if (existCharacters.includes(character)) throw new Error(`Character ${character} already exists`);
        const rootDir = path.resolve('../');
        const characterPath = path.join(rootDir, `characters/${character}.character.json`);
        await fs.writeFile(characterPath, JSON.stringify(data, null, 2),(err) => {
            if (err) throw err;
        });
        console.log(`${new Date().toISOString()}. Character created. Name: ${character}.`);
        response.json({ status: true });
    } catch (error) {
        response.status(400).json({
            status: false,
            error: error.message,
        });
    }
}

async function UpdateCharacter(request, response) {
    try{
        const {  query: { character }, body: { data } } = request;
        if (!data || typeof data !== 'object') throw new Error("Data must be a JSON object.");
        if (!character || typeof character !== 'string') throw new Error("Character must be string.");
        const rootDir = path.resolve('../');
        const characterPath = path.join(rootDir, `characters/${character}.character.json`);
        await fs.writeFile(characterPath, JSON.stringify(data, null, 2),(err) => {
            if (err) throw err;
        });
        console.log(`${new Date().toISOString()}. Character Updated. Name: ${character}.`);
        response.json({ status: true });
    } catch (error) {
        response.status(400).json({
            status: false,
            error: error.message,
        });
    }
}
async function DeleteCharacter(request, response) {
    try{
        const { query: { character } } = request;
        if (!character || typeof character !== 'string') throw new Error("Character must be string.");
        const rootDir = path.resolve('../');
        const characterPath = path.join(rootDir, `characters/${character}.character.json`);
        try {
            fs.accessSync(characterPath);
        } catch {
            throw new Error(`Character file not found: ${characterPath}`);
        }
        await fs.unlinkSync(characterPath);
        const runningProcesses = await ReadRunningProcessesPm2();
        const runningCharacter = runningProcesses.find((runCharacter) => (runCharacter.name === character));
        if (runningCharacter) {
            await new Promise((resolve, reject) => pm2.connect((err) => (err ? reject(new Error(`Error connecting to PM2: ${err.message}`)) : resolve())));
            await new Promise((resolve, reject) => pm2.delete(runningCharacter.name,(err)=>
                (err ? reject(new Error(`Error stop Eliza process PM2 with name: "${runningCharacter.name}": ${err.message}`)) : resolve())));
            console.log(`${new Date().toISOString()}. Character stopped. name: ${runningCharacter.name}. Id: ${runningCharacter.pm_id}.`);
            // WriteJsonFile(runningProcesses);
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }
        console.log(`${new Date().toISOString()}. Character deleted. Name: ${character}.`);
        response.json({ status: true });
    } catch (error) {
        response.status(400).json({
            status: false,
            error: error.message,
        });
    }
}

async function CharacterList(request, response) {
    try {
        let characters = await GetCharacterList();
        const runningCharacters = await ReadRunningProcessesPm2();
        characters = characters.map((character) => {
            const runningCharacter = runningCharacters.find((runCharacter) => (runCharacter.name === character));
            return {
                character: character,
                ...(runningCharacter && { process: runningCharacter })
            }
        })
        response.json({ status: true, characters });
    } catch (error) {
        response.status(400).json({
            status: false,
            error: error.message,
        });
    }
}

async function CharacterView(request, response) {
    try{
        const { query: { character } } = request;
        if (!character || typeof character !== 'string') throw new Error("Character must be string.");
        const rootDir = path.resolve('../');
        const characterPath = path.join(rootDir, `characters/${character}.character.json`);
        let characterData = {};
        if (fs.existsSync(characterPath)) {
            characterData = JSON.parse(fs.readFileSync(characterPath, 'utf-8'));
        }
        response.json({ status: true, character: characterData });
    } catch (error) {
        response.status(400).json({
            status: false,
            error: error.message,
        });
    }
}

async function LogViewStream(request, response) {
    try{
        const { query: { character } } = request;
        if (!character || typeof character !== 'string') throw new Error("Character must be string.");
        const runningProcesses = await ReadRunningProcessesPm2();
        const runningCharacter = runningProcesses.find((runCharacter) => (runCharacter.name === character));
        if (runningCharacter) {
            const logPath = runningCharacter.log_file;
            if (fs.existsSync(logPath)) {
                const fileStream = fs.createReadStream(logPath, { encoding: 'utf8' });
                const rl = readline.createInterface({
                    input: fileStream,
                    crlfDelay: Infinity
                });
                // Set headers for streaming response
                response.setHeader('Content-Type', 'application/json');
                response.setHeader('Transfer-Encoding', 'chunked');
                response.write('{"status":true,"view":[');
                let isFirstChunk = true;
                rl.on('line', (line) => {
                    if (!isFirstChunk) {
                        response.write(',');
                    }
                    isFirstChunk = false;
                    response.write(JSON.stringify(line));
                });

                rl.on('close', () => {
                    response.write(']}');
                    response.end();
                });
                rl.on('error', (error) => {
                    throw new Error(`Error reading log file: ${error.message}`);
                });
            } else throw new Error(`Lof file not found: ${logPath}`);
        } else throw new Error(`Character not found in running processes`);
    } catch (error) {
        response.status(400).json({
            status: false,
            error: error.message,
        });
    }
}

async function CharacterLogErrors(request, response) {
    try {
        const { query: { character, skipUnimpErrors, reverse, time_ago, errmsg_keeplength, errmsg_maxlength } } = request;
        const skipUnimportantErrors = skipUnimpErrors === 'true' || skipUnimpErrors === '1' || false;
        // In minutes
        const timeAgo = time_ago;
        const errMsgKeepLength = errmsg_keeplength || 1200;
        const errMsgMaxLength = errmsg_maxlength || 5000;
        const reverseErrors = !(reverse === '0' || reverse === 'false');
        let runningProcesses = await ReadRunningProcessesPm2();
        if (character) {
            runningProcesses = runningProcesses.filter((runningCharacter) => (runningCharacter.name === character));
            if (runningProcesses.length < 1) throw new Error(`Character not found in running processes`)
        }
        const errors = [];
        for (const runningCharacter of runningProcesses) {
            const logPath = runningCharacter.log_file;
            if (fs.existsSync(logPath)) {
                let characterErrors = await LogErrors(logPath, errMsgKeepLength, errMsgMaxLength, skipUnimportantErrors);
                if (reverseErrors) characterErrors.reverse();
                if (timeAgo) {
                    characterErrors = characterErrors.filter((error) => {
                        let date = null;
                        if (typeof error === 'string') {
                            // Extract timestamp for string errors
                            const match = error.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
                            date = match ? new Date(match[0]) : null;
                        } else if (Array.isArray(error)) {
                            // Extract timestamp for array errors
                            const match = error.find(item => /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/.test(item));
                            date = match ? new Date(match.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/)[0]) : null;
                        }
                        // Check if date is valid and within the last 60 minutes
                        return date && (Date.now() - date.getTime() <= timeAgo * 60 * 1000);
                    });
                }
                errors.push({
                    character: runningCharacter.name,
                    errors: characterErrors
                })
            } else throw new Error(`Lof file not found: ${logPath}`);
        }
        if (character) {
            response.json({ status: true, errors: errors[0].errors });
        } else response.json({ status: true, characters: errors });
    } catch (error) {
        response.status(400).json({
            status: false,
            error: error.message,
        });
    }
}

async function LogErrors(logFile, keepLength = 1200, maxLength = 5000, skipUnimportantErrors = false) {
    const errorBlocks = [];
    let errorBlock = [];
    let isErrorBlock = false;
    let skipErrorBlock = false;
    const fileStream = fs.createReadStream(logFile, { encoding: 'utf8' });
    // Use readline to process the file line-by-line
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity // Handles different newline formats
    });
    for await (const line of rl) {
        // 'ERRORS' block start
        if (line.includes('ERRORS')) {
            // If after 'ERRORS' goes next 'ERRORS'
            if (isErrorBlock) {
                if (!skipErrorBlock) errorBlocks.push(errorBlock);
                errorBlock = [];
            }
            errorBlock.push(clearContent(line, keepLength, maxLength));
            isErrorBlock = true;
            skipErrorBlock = false;
            continue;
        }
        // if just one string
        if (line.includes('⛔') && !isErrorBlock) {
            errorBlocks.push(clearContent(line, keepLength, maxLength));
        }
        // Collect lines in the current 'ERRORS' block
        if (isErrorBlock) {
            const logEvents = ['LOGS', 'WARNINGS', 'INFORMATIONS', 'SUCCESS', 'DEBUG', 'ASSERT'];
            if (line === '' || logEvents.some(logEvent => line.includes(logEvent))) {
                // End of current 'ERRORS' block
                if (!skipErrorBlock) errorBlocks.push(errorBlock);
                errorBlock = [];
                isErrorBlock = false;
            } else {
                if (skipUnimportantErrors) {
                    const skipErrors = ['OpenAI API error:', 'OpenAI request failed', 'Error in recognizeWithOpenAI:', 'Error in handleTextOnlyReply:', 'Error in quote tweet generation:'];
                    if (skipErrors.some(skipError => line.includes(skipError))) skipErrorBlock = true;
                }
                errorBlock.push(clearContent(line, keepLength, maxLength));
            }
        }
    }
    return errorBlocks;
}

function trimMiddleContent(bigString, keepLength, maxLength) {
    if (bigString.length <= maxLength) return bigString;
    const halfKeepLength = Math.floor(keepLength / 2);
    const startPart = bigString.slice(0, halfKeepLength); // Extract the beginning part
    const endPart = bigString.slice(-halfKeepLength);    // Extract the ending part
    return `${startPart}...[CONTENT REMOVED]...${endPart}`;
}

function clearContent(line, keepLength, maxLength) {
    let clearContent = line.replace(/\x1b\[30m|\x1b\[31m|\x1b\[32m|\x1b\[33m|\x1b\[34m|\x1b\[35m|\x1b\[36m|\x1b\[37m|\x1b\[40m|\x1b\[43m|\x1b\[44m|\x1b\[45m|\x1b\[46m|\x1b\[47m|\x1b\[0m/g, "").trim();
    clearContent = trimMiddleContent(clearContent, keepLength, maxLength);
    return clearContent;
}

// Read running processes from pm2
async function ReadRunningProcessesPm2() {
    const excludedNames = ['eliza_character_api'];
    await new Promise((resolve, reject) => pm2.connect((err) => (err ? reject(new Error(`Error connecting to PM2: ${err}`)) : resolve())));
    let list = await new Promise((resolve, reject) => pm2.list((err, processList)=> (err ? reject(new Error(`Error retrieving Eliza process list: ${err.message}`)) : resolve(processList))));
    pm2.disconnect();
    list = list.map((item) => ({ pid: item.pid, pm_id: item.pm2_env.pm_id, name: item.name, log_file: item.pm2_env.pm_out_log_path, character_path:`characters/${item.name}.character.json` }));
    list = list.filter((item) => !excludedNames.includes(item.name));
    return list;
}

async function GetCharacterList() {
    const rootDir = path.resolve('../');
    const charactersPath = path.join(rootDir, `characters/`);
    const files = await new Promise((resolve, reject) => fs.readdir(charactersPath, (err, files) => (err ? reject(new Error(`Error reading characters directory: ${err.message}`)) : resolve(files))));
    return files.filter((file) => file.endsWith('.character.json')).map((file) => (file.split('.character')[0])); // Extract the part before `.character`
}

async function sendToBotNotifier(message) {
    const { brnAccessToken, brnHost, botNotifierId } = common_config;
    await got.post(`${brnHost}/broadcast`, {
        headers: { 'x-access-token': brnAccessToken },
        json: {
            bot_id: botNotifierId,
            type: 'manual',
            timing: { timezone: 0, type: 'now' },
            broadcast_data: { messages: [{ type: 'text', content: { text: message } }] },
            subscribers: { context: [], providers: [], gender: [], tags: [], roles: [] },
            name: `${botNotifierId} - ${(new Date().toISOString())}`,
        },
    }).json;
    await new Promise((resolve) => setTimeout(resolve, 1000));
}

async function RunListFile(request, response) {
    const runningProcesses = ReadJsonFile();
    response.json({ characters: runningProcesses });
}

// Read running processes from file
function ReadJsonFile(filePath) {
    if (!filePath) throw new Error("File path required");
    if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
    return {};
}

// Write running processes to file
function WriteJsonFile(filePath, data) {
    if (!filePath) throw new Error("File path required");
    const { processFile } = common_config;
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// Start the server
app.listen(port, () => {
    console.log(`${new Date().toISOString()}. Eliza API running on http://localhost:${port}`);
});
