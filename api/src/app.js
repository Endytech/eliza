import express from 'express';
import { exec } from 'child_process';
// import path from 'path';
import fs from 'fs';
import { mkdirSync, existsSync } from 'fs';
import * as path from 'path';
import bodyParser from 'body-parser';
import { spawn } from 'child_process';
// import export_ipmort_config from './_config';
import treeKill from 'tree-kill';

const app = express();
const port = 3100;
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});
app.use(bodyParser.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ extended: false }));

// File to store running process information
const processFile = 'runningProcesses.json';

// Start character
app.get('/eliza/character/start', StartCharacter);
// Stop character
app.get('/eliza/character/stop',StopCharacter);
// Run character list
app.get('/eliza/character/runlist', RunList);
// Create character
app.post('/eliza/character', CreateCharacter);

// Helper: Read running processes from file
function readRunningProcesses() {
    if (fs.existsSync(processFile)) {
        return JSON.parse(fs.readFileSync(processFile, 'utf-8'));
    }
    return {};
}

// Helper: Write running processes to file
function writeRunningProcesses(processes) {
    fs.writeFileSync(processFile, JSON.stringify(processes, null, 2));
}

// API to start Eliza with a specific character
async function StartCharacter(request, response) {
    try {
        const { query: { character } } = request;
        if (!character) throw new Error('character required');
        const characterPath = `characters/${character}.character.json`;
        const runningProcesses = readRunningProcesses();

        // Check if process for this character is already running
        if (runningProcesses[character]) {
            return response.status(400).json({ error: `Eliza is already running for ${characterPath}` });
        }

        // Resolve the root directory and logs directory
        const rootDir = path.resolve('../');
        const logsDir = path.join(rootDir, 'logs');
        const logFile = path.join(logsDir, `logs_${character}_${new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_')}.txt`);
        // Ensure the logs directory exists
        if (!existsSync(logsDir)) {
            throw new Error('Does not exist log directory', logsDir);
        }
        const command = `pnpm start:debug --characters="${characterPath}" 2>&1 | tee ${logFile}`;
        const process = exec(command, { cwd: rootDir }, (error, stdout, stderr) => {
            // if (error) {
            //     console.error(`Error run process: ${error.message}`);
            // }
            if (stderr) {
                console.error(`Stderr when run process: ${stderr}`)
            }
            console.log(`Stdout: ${stdout}`);
        });

        // process.on('close', (code) => {
        //     if (code === 0) {
        //         console.log(`Process for ${characterPath} completed successfully.`);
        //     } else {
        //         console.error(`Process for ${characterPath} exited with error code ${code}.`);
        //     }
        // });

// // Build the command
//         const command = `pnpm`;
//         const args = [
//             'start:debug',
//             `--characters=${characterPath}`,
//         ];
//         console.log('Command:', command, args);
//
// // Spawn the process
//         const process = spawn(command, args, {
//             cwd: rootDir,
//             shell: true, // Required for piping (`tee`)
//             stdio: ['inherit', 'pipe', 'pipe'], // Pipe output for logs
//         });
//         console.log('process', process);
//
// // Log stdout and stderr to a file
//         const logStream = fs.createWriteStream(logFile, { flags: 'a' });
//         process.stdout.pipe(logStream);
//         process.stderr.pipe(logStream);
//
        // Save the process PID to the file
        runningProcesses[character] = { pid: process.pid, log_file: logFile, character, character_path: characterPath };
        writeRunningProcesses(runningProcesses);
        console.log(`Started eliza process with PID: ${process.pid} for ${characterPath}`);
        response.json({ status: true, pid: process.pid, log_file: logFile, character, character_path: characterPath });
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
        if (!character) throw new Error('character required');
        const characterPath = `characters/${character}.character.json`;

        const runningProcesses = readRunningProcesses();
        const processInfo = runningProcesses[character];

        if (!processInfo) {
            return response.status(404).json({ error: `No running process found for ${characterPath}` });
        }
        // Kill the process and all child processes
        treeKill(processInfo.pid);
        console.log(`Eliza stopped with PID: ${process.pid} for ${characterPath}`);
        delete runningProcesses[character];
        writeRunningProcesses(runningProcesses);
        response.json({ status: true, character, character_path: characterPath });
    } catch (error) {
        response.status(400).json({
            status: false,
            error: error.message,
        });
    }
}

async function RunList(request, response) {
    const runningProcesses = readRunningProcesses();
    response.json({ runningProcesses });
}

async function CreateCharacter(request, response) {
    try{
        const { body: { character, data } } = request;
        if (!data || typeof data !== 'object') {
            throw new Error("Data must be a JSON object.");
        }
        console.log('data', data);
        if (!data || typeof data !== 'object') {
            throw new Error("Data must be a JSON object.");
        }

        if (!character || typeof character !== 'string') {
            throw new Error("Character must be string.");
        }

        // Define the file path where the JSON will be saved
        const rootDir = path.resolve('../');
        const characterPath = path.join(rootDir, `characters/${character}.character.json`);
        console.log('characterPath', characterPath);
        // Save the character JSON to the file
        await fs.writeFile(characterPath, JSON.stringify(character, null, 2));
        // (err) => {
        //     if (err) throw err;
        // }
        response.json({ status: true, character, character_path: characterPath });
    } catch (error) {
        response.status(400).json({
            status: false,
            error: error.message,
        });
    }
}

// Start the server
app.listen(port, () => {
    console.log(`Eliza API running on http://localhost:${port}`);
});
