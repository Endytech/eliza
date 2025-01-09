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
app.get('/eliza/character/start', (request, response) => {
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
            if (error) {
                console.error(`Error run process: ${error.message}`);
            }
            if (stderr) {
                console.error(`Stderr when run process: ${stderr}`)
            }
            console.log(`Stdout: ${stdout}`);
        });

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
// // Handle process termination
//         process.on('close', (code) => {
//             console.log(`Process exited with code: ${code}`);
//             logStream.end();
//         });

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
});

// API to stop Eliza for a specific character
// app.post('/stop-eliza', (req, res) => {
//     const characterPath = req.query.characterPath;
//
//     if (!characterPath) {
//         return res.status(400).json({ error: "characterPath is required to stop Eliza" });
//     }
//
//     const runningProcesses = readRunningProcesses();
//     const processInfo = runningProcesses[characterPath];
//
//     if (!processInfo) {
//         return res.status(404).json({ error: `No running process found for ${characterPath}` });
//     }
//
//     // Kill the process
//     try {
//         process.kill(processInfo.pid);
//         console.log(`Eliza stopped for ${characterPath}`);
//         delete runningProcesses[characterPath];
//         writeRunningProcesses(runningProcesses);
//         res.json({ message: "Eliza stopped", character: characterPath });
//     } catch (error) {
//         console.error(`Failed to stop process for ${characterPath}:`, error.message);
//         res.status(500).json({ error: `Failed to stop process for ${characterPath}` });
//     }
// });

app.get('/eliza/character/stop', (request, response) => {
    try {
        const { query: { character } } = request;
        if (!character) throw new Error('character required');
        const characterPath = `characters/${character}.character.json`;

        const runningProcesses = readRunningProcesses();
        const processInfo = runningProcesses[character];

        if (!processInfo) {
            return response.status(404).json({ error: `No running process found for ${characterPath}` });
        }
        // Kill the process
        // process.kill(processInfo.pid);
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
});

// API to list all running processes
app.get('/eliza/character/runlist', (req, res) => {
    const runningProcesses = readRunningProcesses();
    res.json({ runningProcesses });
});

// Start the server
app.listen(port, () => {
    console.log(`Eliza API running on http://localhost:${port}`);
});
