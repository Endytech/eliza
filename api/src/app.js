import express from 'express';
import { exec } from 'child_process';
import fs from 'fs';
import * as path from 'path';
import bodyParser from 'body-parser';
// import { spawn } from 'child_process';
import common_config from './_config';
import treeKill from 'tree-kill';

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
app.get('/character/log', LogView);
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


async function StartCharacter(request, response) {
    try {
        const { query: { character, restart } } = request;
        if (!character || typeof character !== 'string') throw new Error("Character must be string.");
        const characterPath = `characters/${character}.character.json`;

        const isRestart = restart === 'true' || restart === '1' || false;

        let existCharacters = GetCharacterList();
        existCharacters = existCharacters.map((item) => item.character);
        if (!existCharacters.includes(character)) throw new Error(`Character ${character} does not exists`);

        const runningProcesses = ReadRunningProcesses();
        // Check if process for this character is already running
        if (runningProcesses[character]) {
            if (isRestart) {
                treeKill(runningProcesses[character].pid);
                delete runningProcesses[character];
                WriteRunningProcesses(runningProcesses);
                await new Promise((resolve) => setTimeout(resolve, 5000));
            } else {
                return response.status(400).json({ error: `Eliza is already running for ${characterPath}` });
            }
        }
        // Resolve the root directory and logs directory
        const rootDir = path.resolve('../');
        const logsDir = path.join(rootDir, 'logs');
        const logFile = path.join(logsDir, `logs_${character}_${new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_')}.txt`);
        // Ensure the logs directory exists
        if (!fs.existsSync(logsDir)) {
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
            // console.log(`Stdout: ${stdout}`);
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
        const characterPathFull = path.join(rootDir, characterPath);
        // Save the process PID to the file
        runningProcesses[character] = { pid: process.pid, log_file: logFile, character, character_path: characterPathFull };
        WriteRunningProcesses(runningProcesses);
        console.log(`Started eliza process with PID: ${process.pid} for ${characterPathFull}`);
        response.json({ status: true, pid: process.pid, log_file: logFile, character, character_path: characterPathFull });
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
        const rootDir = path.resolve('../');
        const characterPathFull = path.join(rootDir, `characters/${character}.character.json`);

        const runningProcesses = ReadRunningProcesses();
        const processInfo = runningProcesses[character];

        if (!processInfo) {
            return response.status(404).json({ error: `No running process found for ${characterPathFull}` });
        }
        // Kill the process and all child processes
        treeKill(processInfo.pid);
        console.log(`Eliza stopped with PID: ${process.pid} for ${characterPathFull}`);
        delete runningProcesses[character];
        WriteRunningProcesses(runningProcesses);
        await new Promise((resolve) => setTimeout(resolve, 2000));
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
            treeKill(runningProcesses[character].pid);
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
