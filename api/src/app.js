import express from 'express';
// import { exec } from 'child_process';
import fs from 'fs';
import * as path from 'path';
import bodyParser from 'body-parser';
// import { spawn } from 'child_process';
import common_config from './_config';
// import treeKill from 'tree-kill';
import readline from 'readline';
import pm2 from 'pm2';

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
app.get('/character/stop',StopCharacter);
// Run character list
app.get('/character/runlist', RunList);
// View character log
app.get('/character/log', LogViewStream);
// View character log errors
app.get('/character/errors', CharacterLogErrors);
// Create character
app.post('/character', CreateCharacter);
// Characters list
app.get('/characters', CharacterList);
// Get Character
app.get('/character', CharacterView);
// Update character
app.put('/character', UpdateCharacter);
// Delete character
app.delete('/character', DeleteCharacter);

async function processLogsAndReportErrors(request, response) {
    try {
        console.log('Processing logs...');
        const runningProcesses = ReadRunningProcesses();
        let notification = {};
        for (const [key, process] of Object.entries(runningProcesses)) {
            const logFile = process.log_file;
            try {
                notification[key] = await LogErrors(logFile);
            } catch (error) {
                console.error(`Failed to read logs for ${key}:`, error.message);
            }
        }
        response.json({ status: true, notification });
    } catch (error) {
        response.status(400).json({
            status: false,
            error: error.message,
        });
    }
    // await new Promise((resolve) => setTimeout(resolve, 30 * 60 * 1000));
}

// processLogsAndReportErrors();

// async function StartCharacter(request, response) {
//     try {
//         const { query: { character, restart, debug } } = request;
//         if (!character || typeof character !== 'string') throw new Error("Character must be string.");
//         const characterPath = `characters/${character}.character.json`;
//
//         const isRestart = restart === 'true' || restart === '1' || false;
//         const isDebug = debug === 'true' || debug === '1' || false;
//
//         let existCharacters = GetCharacterList();
//         existCharacters = existCharacters.map((item) => item.character);
//         if (!existCharacters.includes(character)) throw new Error(`Character ${character} does not exists`);
//
//         const runningProcesses = ReadRunningProcesses();
//         // Check if process for this character is already running
//         if (runningProcesses[character]) {
//             if (isRestart) {
//                 treeKill(runningProcesses[character].pid, 'SIGTERM', (err) => {
//                     if (err) console.error('Failed to kill process:', err);
//                 });
//                 delete runningProcesses[character];
//                 WriteRunningProcesses(runningProcesses);
//                 await new Promise((resolve) => setTimeout(resolve, 5000));
//             } else {
//                 return response.status(400).json({ error: `Eliza is already running for ${characterPath}` });
//             }
//         }
//         // Resolve the root directory and logs directory
//         const rootDir = path.resolve('../');
//         const logsDir = path.join(rootDir, 'logs');
//         const logFile = path.join(logsDir, `logs_${character}_${new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_')}.txt`);
//         // Ensure the logs directory exists
//         if (!fs.existsSync(logsDir)) {
//             throw new Error('Does not exist log directory', logsDir);
//         }
//         // const command = `pnpm start:debug --characters="${characterPath}" 2>&1 | tee ${logFile}`;
//         // const process = exec(command, { cwd: rootDir }, (error, stdout, stderr) => {
//         //     if (error) {
//         //         console.error(`Error run process: ${error.message}`);
//         //     }
//         //     if (stderr) {
//         //         console.error(`Stderr when run process: ${stderr}`)
//         //     }
//         //     // console.log(`Stdout: ${stdout}`);
//         // });
//         //
//         // Build the command
//         const command = `pnpm`;
//         const args = [
//             `start${isDebug ? ':debug' : ''}`,
//             `--characters=${characterPath}`,
//         ];
//         // console.log('Command:', command, args);
//
//         // Spawn the process
//         const process = spawn(command, args, {
//             cwd: rootDir,
//             shell: true, // Required for piping (`tee`)
//             // detached: true,
//             stdio: ['ignore', 'pipe', 'pipe'], // Pipe output for logs
//         });
//         // const process = spawn(command, args, {
//         //     cwd: rootDir,
//         //     // shell: true,
//         //     detached: true,
//         //     stdio: ['ignore', 'ignore', 'ignore'],
//         // });
//
//         // process.unref();
//         // console.log('process', process);
//
//         // Detach from this API, to not close process when this API terminated
//         // const process = spawn(command, args, {
//         //     cwd: rootDir,
//         //     shell: true, // Required for piping (`tee`)
//         //     detached: true,
//         //     stdio: ['inherit', 'pipe', 'pipe'], // Pipe output for logs
//         // });
//
// //         // Clean up active processes when the API server is terminated
// //         function handleExit() {
// //             console.log('Cleaning up active processes...');
// //             activeProcesses.forEach((proc) => {
// //                 console.log(`Killing process with PID: ${proc.pid}`);
// //                 proc.kill('SIGTERM'); // Send a signal to terminate the process
// //             });
// //             process.exit(0);
// //         }
// //
// // // Attach signal listeners
// //         process.on('SIGINT', handleExit);
// //         process.on('SIGTERM', handleExit);
//
//         // Log stdout and stderr to a file
//         const logStream = fs.createWriteStream(logFile, { flags: 'a' });
//         process.stdout.pipe(logStream);
//         process.stderr.pipe(logStream);
//
//         const characterPathFull = path.join(rootDir, characterPath);
//
//         process.on('close', (code) => {
//             if (code === 0) {
//                 console.log(`Process for ${characterPathFull} completed successfully.`);
//             } else {
//                 console.error(`Process for ${characterPathFull} exited with error code ${code}.`);
//             }
//         });
//
//         // Save the process PID to the file
//         runningProcesses[character] = { pid: process.pid, log_file: logFile, character, character_path: characterPathFull };
//         WriteRunningProcesses(runningProcesses);
//         console.log(`Started eliza process with PID: ${process.pid} for ${characterPathFull}`);
//         response.json({ status: true, pid: process.pid, log_file: logFile, character, character_path: characterPathFull });
//     } catch (error) {
//         response.status(400).json({
//             status: false,
//             error: error.message,
//         });
//     }
// }

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
        const characterPathFull = path.join(rootDir, characterPath);
        // Ensure the logs directory exists
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir);
        }
        // Check if character file does not exists
        let existCharacters = GetCharacterList();
        existCharacters = existCharacters.map((item) => item.character);
        if (!existCharacters.includes(character)) throw new Error(`Character ${character} does not exists`);
        // Connect to pm2
        await new Promise((resolve, reject) => pm2.connect((err) => (err ? reject(new Error(`Error connecting to PM2: ${err}`)) : resolve())));
        // Check if process for this character is already running
        const runningProcesses = ReadRunningProcesses();
        // console.log('runningProcesses[character]', runningProcesses[character]);
        if (runningProcesses[character]) {
            if (isRestart) {
                // Delete the existing process
                await new Promise((resolve, reject) => pm2.delete(runningProcesses[character].name,(err)=>
                    (err ? reject(new Error(`Error deleting Eliza process PM2 with name: "${runningProcesses[character].name}": ${err}`)) : resolve())));
                delete runningProcesses[character];
                WriteRunningProcesses(runningProcesses);
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
        },(err, apps) => (err ? reject(new Error(`Error starting Eliza process PM2 with name: "${character}": ${err}`)) : resolve(apps))));
        // console.log(`apps`, JSON.stringify(apps, null, 4));
        if (!apps || apps.length === 0) {
            pm2.disconnect();
            throw new Error(`Error on start Eliza process PM2 with name: ${character}`);
        }
        runningProcesses[character] = { pid: apps[0].pid, pm_id: apps[0].pm2_env.pm_id, name: character, log_file: logFile, character_path: characterPathFull };
        WriteRunningProcesses(runningProcesses);
        console.log(`Started Eliza process PM2 with name: ${character} and id: ${apps[0].pm2_env.pm_id}`);
        pm2.disconnect(); // Disconnect from PM2 when done
        response.json({ status: true, pid: apps[0].pid, pm_id: apps[0].pm2_env.pm_id, character, log_file: logFile, character_path: characterPathFull });
        // pm2.connect(function (err) {
        //     if (err) {
        //         throw new Error(`Error connecting to PM2: ${err}`);
        //         // process.exit(2);
        //     }
        //     // Check if process for this character is already running
        //     const runningProcesses = ReadRunningProcesses();
        //     // console.log('runningProcesses[character]', runningProcesses[character]);
        //     if (runningProcesses[character]) {
        //         if (isRestart) {
        //             pm2.delete(runningProcesses[character].name, (err) => {
        //                 if (err) {
        //                     throw new Error(`Error deleting Eliza process PM2 with name: "${runningProcesses[character].name}": ${err}`);
        //                 } else {
        //                     delete runningProcesses[character];
        //                     WriteRunningProcesses(runningProcesses);
        //                     pm2.start({
        //                         name: character, // PM2 process name
        //                         script: 'pnpm',
        //                         args: [`start${isDebug ? ':debug' : ''}`, `--characters=${characterPath}`],
        //                         cwd: rootDir, // Set current directory for execution
        //                         // log_file: logFile, // Direct output to a log file
        //                         output: logFile, // Redirect stdout to log file
        //                         error: logFile, // Redirect stderr to log file
        //                     }, function (err, apps) {
        //                         if (err) {
        //                             pm2.disconnect();
        //                             throw new Error(`Error starting Eliza process PM2 with name: "${character}": ${err}`);
        //                             // process.exit(1);
        //                         }
        //                         if (!apps || apps.length === 0) {
        //                             pm2.disconnect();
        //                             throw new Error(`PM2 did not return process information for "${character}".`);
        //                         }
        //                         // console.log(`apps`, JSON.stringify(apps, null, 4));
        //                         runningProcesses[character] = { pid: apps[0].pid, pm_id: apps[0].pm2_env.pm_id, name: character, log_file: logFile, character_path: characterPathFull };
        //                         WriteRunningProcesses(runningProcesses);
        //                         console.log(`Started Eliza process PM2 with name: ${character} and id: ${apps[0].pm2_env.pm_id}`);
        //                         pm2.disconnect(); // Disconnect from PM2 when done
        //                         response.json({ status: true, pid: apps[0].pid, pm_id: apps[0].pm_id, character, log_file: logFile, character_path: characterPathFull });
        //                     });
        //                 }
        //             });
        //         } else {
        //             return response.status(400).json({ error: `Eliza is already running for character: ${character}` });
        //         }
        //     } else {
        //         // Start the process using pm2
        //         pm2.start({
        //             name: character, // PM2 process name
        //             script: 'pnpm',
        //             args: [`start${isDebug ? ':debug' : ''}`, `--characters=${characterPath}`],
        //             cwd: rootDir, // Set current directory for execution
        //             // log_file: logFile, // Direct output to a log file
        //             output: logFile, // Redirect stdout to log file
        //             error: logFile, // Redirect stderr to log file
        //         }, function (err, apps) {
        //             if (err) {
        //                 pm2.disconnect();
        //                 throw new Error(`Error starting Eliza process PM2 with name: "${character}": ${err}`);
        //                 // process.exit(1);
        //             }
        //             // console.log(`apps`, JSON.stringify(apps, null, 4));
        //             runningProcesses[character] = { pid: apps[0].pid, pm_id: apps[0].pm2_env.pm_id, name: character, log_file: logFile, character_path: characterPathFull };
        //             WriteRunningProcesses(runningProcesses);
        //             console.log(`Started Eliza process PM2 with name: ${character} and id: ${apps[0].pm2_env.pm_id}`);
        //             pm2.disconnect(); // Disconnect from PM2 when done
        //             response.json({ status: true, pid: apps[0].pid, pm_id: apps[0].pm_id, character, log_file: logFile, character_path: characterPathFull });
        //         });
        //         // pm2.list((err, processList) => {
        //         //     if (err) {
        //         //         console.error('Error retrieving process list:', err);
        //         //         pm2.disconnect();
        //         //         process.exit(1);
        //         //     }
        //         //
        //         //     console.log('PM2 Process List:');
        //         //     processList.forEach((proc) => {
        //         //         console.log(`proc`, JSON.stringify(proc, null, 4));
        //         //         console.log(`Name: ${proc.name}, ID: ${proc.pm_id}, PID: ${proc.pid}`);
        //         //         });
        //         // });
        //     }
        // });
    } catch (error) {
        response.status(400).json({
            status: false,
            error: error.message,
        });
    }
}

// async function StopCharacter(request, response) {
//     try {
//         const { query: { character } } = request;
//         if (!character || typeof character !== 'string') throw new Error("Character must be string.");
//         const rootDir = path.resolve('../');
//         const characterPathFull = path.join(rootDir, `characters/${character}.character.json`);
//
//         const runningProcesses = ReadRunningProcesses();
//         const processInfo = runningProcesses[character];
//
//         if (!processInfo) {
//             return response.status(404).json({ error: `No running process found for ${characterPathFull}` });
//         }
//         // Kill the process and all child processes
//         treeKill(processInfo.pid, 'SIGTERM', (err) => {
//             if (err) console.error('Failed to kill process:', err);
//         });
//         console.log(`Eliza stopped with PID: ${process.pid} for ${characterPathFull}`);
//         delete runningProcesses[character];
//         WriteRunningProcesses(runningProcesses);
//         await new Promise((resolve) => setTimeout(resolve, 2000));
//         response.json({ status: true });
//     } catch (error) {
//         response.status(400).json({
//             status: false,
//             error: error.message,
//         });
//     }
// }

async function StopCharacter(request, response) {
    try {
        const { query: { character } } = request;
        if (!character || typeof character !== 'string') throw new Error("Character must be string.");
        const runningProcesses = ReadRunningProcesses();
        if (!runningProcesses[character]) throw new Error(`No running process found for character: ${character}`);
        await new Promise((resolve, reject) => pm2.connect((err) => (err ? reject(new Error(`Error connecting to PM2: ${err}`)) : resolve())));
        await new Promise((resolve, reject) => pm2.delete(runningProcesses[character].name,(err)=>
            (err ? reject(new Error(`Error stop Eliza process PM2 with name: "${runningProcesses[character].name}": ${err}`)) : resolve())));
        console.log(`Stopped Eliza process PM2 with name: ${runningProcesses[character].name} and id: ${runningProcesses[character].pm_id}.`);
        delete runningProcesses[character];
        WriteRunningProcesses(runningProcesses);
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
    const runningProcesses = ReadRunningProcesses();
    response.json({ characters: runningProcesses });
}

async function CreateCharacter(request, response, update = false) {
    try{
        const {  query: { character }, body: { data } } = request;
        if (!data || typeof data !== 'object') throw new Error("Data must be a JSON object.");
        if (!character || typeof character !== 'string') throw new Error("Character must be string.");
        let existCharacters = GetCharacterList();
        existCharacters = existCharacters.map((item) => item.character);
        if (existCharacters.includes(character)) throw new Error(`Character ${character} already exists`);
        const rootDir = path.resolve('../');
        const characterPath = path.join(rootDir, `characters/${character}.character.json`);
        await fs.writeFile(characterPath, JSON.stringify(data, null, 2),(err) => {
            if (err) throw err;
        });
        response.json({ status: true, character, character_path: characterPath });
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
        response.json({ status: true, character, character_path: characterPath });
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
        const runningProcesses = ReadRunningProcesses();
        if (runningProcesses[character]) {
            await new Promise((resolve, reject) => pm2.connect((err) => (err ? reject(new Error(`Error connecting to PM2: ${err}`)) : resolve())));
            await new Promise((resolve, reject) => pm2.delete(runningProcesses[character].name,(err)=>
                (err ? reject(new Error(`Error stop Eliza process PM2 with name: "${runningProcesses[character].name}": ${err}`)) : resolve())));
            console.log(`Stopped Eliza process PM2 with name: ${runningProcesses[character].name} and id: ${runningProcesses[character].pm_id}.`);
            delete runningProcesses[character];
            WriteRunningProcesses(runningProcesses);
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }
        response.json({ status: true });
    } catch (error) {
        response.status(400).json({
            status: false,
            error: error.message,
        });
    }
}

async function CharacterList(request, response) {
    try{
        const characters = GetCharacterList();
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

async function LogView(request, response) {
    try{
        const { query: { character } } = request;
        if (!character || typeof character !== 'string') throw new Error("Character must be string.");
        const runningProcesses = ReadRunningProcesses();
        let logData = '';
        if (runningProcesses[character]) {
            const logPath = runningProcesses[character].log_file;
            if (fs.existsSync(logPath)) {
                logData = fs.readFileSync(logPath, 'utf-8');
            }
        } else throw new Error(`Character not found in running processes`);
        response.json({ status: true, log: logData, view: logData.split('\n') });
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
        const runningProcesses = ReadRunningProcesses();
        let logData = '';
        if (runningProcesses[character]) {
            const logPath = runningProcesses[character].log_file;
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
        const { query: { character, skipUnimpErrors, reverse } } = request;
        if (!character || typeof character !== 'string') throw new Error("Character must be string.");
        const skipUnimportantErrors = skipUnimpErrors === 'true' || skipUnimpErrors === '1' || false;
        const reverseErrors = !(reverse === '0' || reverse === 'false');
        const runningProcesses = ReadRunningProcesses();
        if (runningProcesses[character]) {
            const logPath = runningProcesses[character].log_file;
            if (fs.existsSync(logPath)) {
                const errors = await LogErrors(logPath, skipUnimportantErrors);
                if (reverseErrors) errors.reverse();
                response.json({ status: true, errors });
            } else throw new Error(`Lof file not found: ${logPath}`);
        } else throw new Error(`Character not found in running processes`);
    } catch (error) {
        response.status(400).json({
            status: false,
            error: error.message,
        });
    }
}

async function LogErrors(logFile, skipUnimportantErrors = false) {
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
            errorBlock.push(line.replace(/\x1b\[30m|\x1b\[31m|\x1b\[32m|\x1b\[33m|\x1b\[34m|\x1b\[35m|\x1b\[36m|\x1b\[37m|\x1b\[40m|\x1b\[43m|\x1b\[44m|\x1b\[45m|\x1b\[46m|\x1b\[47m|\x1b\[0m/g, "").trim());
            isErrorBlock = true;
            skipErrorBlock = false;
            continue;
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
                errorBlock.push(line.replace(/\x1b\[30m|\x1b\[31m|\x1b\[32m|\x1b\[33m|\x1b\[34m|\x1b\[35m|\x1b\[36m|\x1b\[37m|\x1b\[40m|\x1b\[43m|\x1b\[44m|\x1b\[45m|\x1b\[46m|\x1b\[47m|\x1b\[0m/g, "").trim());
            }
        }
    }
    return errorBlocks;
}

// Read running processes from file
function ReadRunningProcesses() {
    const { processFile } = common_config;
    if (!processFile) throw new Error("processFile required at config");
    if (fs.existsSync(processFile)) {
        return JSON.parse(fs.readFileSync(processFile, 'utf-8'));
    }
    return {};
}

// Write running processes to file
function WriteRunningProcesses(processes) {
    const { processFile } = common_config;
    if (!processFile) throw new Error("processFile required at config");
    fs.writeFileSync(processFile, JSON.stringify(processes, null, 2));
}

function GetCharacterList() {
    const rootDir = path.resolve('../');
    const charactersPath = path.join(rootDir, `characters/`);
    const files = fs.readdirSync(charactersPath);
    return files.filter((file) => file.endsWith('.character.json')).map((file) => {
        return {
            character: file.split('.character')[0], // Extract the part before `.character`
            character_path: path.join(charactersPath, file)
    }})
}

// Start the server
app.listen(port, () => {
    console.log(`Eliza API running on http://localhost:${port}`);
});
