import express from 'express';
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import bodyParser from 'body-parser';
// import export_ipmort_config from './_config';

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
app.post('/start-eliza', (request, response) => {
    try {
        const { query: { character } } = request;
        if (!character) throw new Error('character required');
        const characterPath = `characters/${character}.character.json`;
        const logFile = `logs/logs_${character}_${new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_')}.txt`;
        console.log('logFile', logFile);
        const runningProcesses = readRunningProcesses();
        console.log('runningProcesses', runningProcesses);

        // Check if process for this character is already running
        if (runningProcesses[characterPath]) {
            return response.status(400).json({ error: `Eliza is already running for ${characterPath}` });
        }

        // Resolve the root directory and logs directory
        const rootDir = path.resolve('../../');
        const logsDir = path.join(rootDir, 'logs');

        // Ensure the logs directory exists
        if (!existsSync(logsDir)) {
            console.log('Does not exist logsDir', logsDir);
            console.log('rootDir', rootDir);
        }

        const command = `pnpm start:debug --characters="${characterPath}" 2>&1 | tee ${logFile}`;
        console.log('command', command);

        const process = exec(command, { rootDir: '../../' }, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error run process: ${error.message}`);
                return;
            }
            if (stderr) {
                console.error(`Stderr when run process: ${stderr}`);
            }
            console.log(`Stdout: ${stdout}`);
        });
        console.log('process', process);

        // Save the process PID to the file
        runningProcesses[characterPath] = { pid: process.pid, logFile };
        writeRunningProcesses(runningProcesses);

        console.log(`Eliza started for ${characterPath}`);
        response.json({ status: true, message: "Eliza started", character: characterPath, logFile });
    } catch (error) {
        response.status(400).json({
            status: false,
            error: error.message,
        });
    }
});

// API to stop Eliza for a specific character
app.post('/stop-eliza', (req, res) => {
    const characterPath = req.query.characterPath;

    if (!characterPath) {
        return res.status(400).json({ error: "characterPath is required to stop Eliza" });
    }

    const runningProcesses = readRunningProcesses();
    const processInfo = runningProcesses[characterPath];

    if (!processInfo) {
        return res.status(404).json({ error: `No running process found for ${characterPath}` });
    }

    // Kill the process
    try {
        process.kill(processInfo.pid);
        console.log(`Eliza stopped for ${characterPath}`);
        delete runningProcesses[characterPath];
        writeRunningProcesses(runningProcesses);
        res.json({ message: "Eliza stopped", character: characterPath });
    } catch (error) {
        console.error(`Failed to stop process for ${characterPath}:`, error.message);
        res.status(500).json({ error: `Failed to stop process for ${characterPath}` });
    }
});

// API to list all running processes
app.get('/list-eliza', (req, res) => {
    const runningProcesses = readRunningProcesses();
    res.json({ runningProcesses });
});

// Start the server
app.listen(port, () => {
    console.log(`Eliza API running on http://localhost:${port}`);
});
