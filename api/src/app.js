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
// Get post
app.get('/character/log/posts', CharacterPosts);
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

async function CharacterLogErrors(request, response) {
    try {
        const { query: { character, notify_errors, time_ago, errmsg_keeplength, errmsg_maxlength, reverse, skipUnimpErrors } } = request;
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
        const totalErrors = [];
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
                            const match = error.match(/\[(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})]/);
                            date = match ? new Date(`${match[1]}T${match[2]}Z`) : null;
                        } else if (Array.isArray(error)) {
                            // Extract timestamp for array errors
                            const matchFind = error.find(item => /\[(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})]/.test(item));
                            const match = matchFind.match(/\[(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})]/);
                            date = match ? new Date(`${match[1]}T${match[2]}Z`) : null;
                        }
                        // Check if date is valid and within the last 60 minutes
                        return date && (Date.now() - date.getTime() <= timeAgo * 60 * 1000);
                    });
                }
                errors.push({
                    character: runningCharacter.name,
                    errors: characterErrors
                })
                if (notify_errors && characterErrors.length > 0) {
                    await new Promise((resolve) => setTimeout(resolve,  2000));
                    await sendToBotNotifier(`_____________________\nCharacter: ${runningCharacter.name}\n\n${characterErrors.join('\n\n')}`);
                }
                if (characterErrors.length > 0) totalErrors.push(`Character: ${runningCharacter.name}\nTotal errors count: ${characterErrors.length}\n_____________________`);
            } else throw new Error(`Log file not found: ${logPath}`);
        }
        if (notify_errors && totalErrors.length > 0) {
            await new Promise((resolve) => setTimeout(resolve,  5000));
            await sendToBotNotifier(totalErrors.join("\n"));
        }
        if (response) {
            if (character) {
                response.json({ status: true, errors: errors[0].errors });
            } else {
                response.json({ status: true, characters: errors, total: totalErrors });
            }
        }
    } catch (error) {
        if (response) {
            response.status(400).json({
                status: false,
                error: error.message,
            });
        } else {
            console.error(`${new Date().toISOString()}. ${error}`);
        }
    }
}

async function autoCharacterNotifyErrors() {
    let { notifyPeriod, notifyErrors, errMsgKeeplength, errMsgMaxlength, appDataFile } = common_config;
    notifyPeriod = notifyPeriod || 60;
    if (notifyErrors) {
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
                // await CharacterNotifyErrors({ query: { character: 'picklepal', notify_errors: notifyErrors, time_ago: 9999999, errmsg_keeplength, errmsg_maxlength } });
                // await CharacterNotifyErrors({ query: { notify_errors: notifyErrors, errmsg_keeplength, errmsg_maxlength } });
                await CharacterLogErrors({ query: { character: 'picklepal', notify_errors: notifyErrors, time_ago: notifyPeriod,  errmsg_keeplength: errMsgKeeplength, errmsg_maxlength: errMsgMaxlength } });
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
                const ansiRegex = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;
                rl.on('line', (line) => {
                    if (!isFirstChunk) response.write(',');
                    isFirstChunk = false;
                    const cleanLine = line.replace(ansiRegex, '');
                    response.write(JSON.stringify(cleanLine));
                });

                rl.on('close', () => {
                    response.write(']}');
                    response.end();
                });
                rl.on('error', (error) => {
                    throw new Error(`Error reading log file: ${error.message}`);
                });
            } else throw new Error(`Log file not found: ${logPath}`);
        } else throw new Error(`Character not found in running processes`);
    } catch (error) {
        response.status(400).json({
            status: false,
            error: error.message,
        });
    }
}

async function CharacterPosts(request, response) {
    try {
        const { query: { character, limit, reverse, errmsg_keeplength, errmsg_maxlength } } = request;
        // In minutes
        const errMsgKeepLength = errmsg_keeplength || 1200;
        const errMsgMaxLength = errmsg_maxlength || 5000;
        const postLimit = limit || 10;
        const reverseLog = !(reverse === '0' || reverse === 'false');
        let runningProcesses = await ReadRunningProcessesPm2();
        if (character) {
            runningProcesses = runningProcesses.filter((runningCharacter) => (runningCharacter.name === character));
            if (runningProcesses.length < 1) throw new Error(`Character not found in running processes`)
        }
        const data = [];
        for (const runningCharacter of runningProcesses) {
            const logPath = runningCharacter.log_file;
            if (fs.existsSync(logPath)) {
                let characterLogsData = await LogPosts(logPath, postLimit, errMsgKeepLength, errMsgMaxLength);
                if (reverseLog) characterLogsData.reverse();
                data.push({
                    character: runningCharacter.name,
                    data: characterLogsData
                })
            } else throw new Error(`Log file not found: ${logPath}`);
        }
        if (character) {
            response.json({ status: true, data: data[0].data });
        } else response.json({ status: true, characters: data });
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
        // 'ERROR' block start
        if (line.includes('31mERROR')) {
            // If after 'ERROR' goes next 'ERROR'
            if (isErrorBlock) {
                if (!skipErrorBlock) errorBlocks.push(errorBlock.length === 1 ? errorBlock[0] : errorBlock);
                errorBlock = [];
            }
            errorBlock.push(clearContent(line, keepLength, maxLength));
            isErrorBlock = true;
            skipErrorBlock = false;
            continue;
        }
        // Collect lines in the current 'ERROR' block
        if (isErrorBlock) {
            const logEvents = ['WARN', 'INFO', 'LOG', 'PROGRESS', 'SUCCESS', 'DEBUG', 'TRACE', 'FATAL'];
            if (line === '' || logEvents.some(logEvent => line.includes(logEvent))) {
                // End of current 'ERRORS' block
                if (!skipErrorBlock) errorBlocks.push(errorBlock.length === 1 ? errorBlock[0] : errorBlock);
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

async function LogPosts(logFile, limit, keepLength = 1200, maxLength = 5000, skipUnimportantErrors = false) {
    const blocks = [];
    let block = [];
    let isBlock = false;
    let skipErrorBlock = false;
    const fileStream = fs.createReadStream(logFile, { encoding: 'utf8' });
    // Use readline to process the file line-by-line
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity // Handles different newline formats
    });
    for await (const line of rl) {
        // Block start
        if (line.includes('Posting new tweet:')) {
            block.push(clearContent(line, keepLength, maxLength));
            isBlock = true;
            continue;
        }
        // Collect lines in the current block
        if (isBlock) {
            const logEvents = ['Tweet posted:'];
            if (logEvents.some(logEvent => line.includes(logEvent))) {
                // End of current block
                block.push(clearContent(line, keepLength, maxLength));
                blocks.push(block);
                block = [];
                isBlock = false;
            } else {
                block.push(clearContent(line, keepLength, maxLength));
            }
        }
        if (limit && blocks.length >= limit) return blocks;
    }
    return blocks;
}

function trimMiddleContent(bigString, keepLength, maxLength) {
    if (bigString.length <= maxLength) return bigString;
    const halfKeepLength = Math.floor(keepLength / 2);
    const startPart = bigString.slice(0, halfKeepLength); // Extract the beginning part
    const endPart = bigString.slice(-halfKeepLength);    // Extract the ending part
    return `${startPart}...[CONTENT REMOVED]...${endPart}`;
}

function clearContent(line, keepLength, maxLength) {
    const ansiRegex = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;
    let cleanLine = line.replace(ansiRegex, '');
    cleanLine = trimMiddleContent(cleanLine, keepLength, maxLength);
    return cleanLine;
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
