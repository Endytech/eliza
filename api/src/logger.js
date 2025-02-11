import fs from 'fs';
import common_config from './_config';

export default class Logger {
    static async Process(request, response, next) {
        let responseBody;
        this.lastSaveMinioTime = this.lastSaveMinioTime || new Date().getTime();
        const startHrTime = process.hrtime();
        response.sendJson = response.json;
        response.json = (body) => {
            responseBody = body;
            response.sendJson(body);
        };
        response.on('finish', async () => {
            if (!response.logged) {
                response.logged = true;
                const elapsedHrTime = process.hrtime(startHrTime);
                const ms = elapsedHrTime[0] * 1000 + elapsedHrTime[1] / 1e6;
                const msgAll = [];
                let logType = 'info';
                if (![200, 304].includes(response.statusCode)) {
                    let errorCause = responseBody ? responseBody.errorCause : '';
                    // For status response 404 mark it by error - user_error
                    errorCause = ([404].includes(response.statusCode) && !errorCause) ? 'user_error' : errorCause;
                    logType = errorCause || 'error';
                    msgAll.push(`${new Date().toISOString()} - LogType: ${logType} - ${request.method} ${request.originalUrl} - ${response.statusCode} - ${response.statusMessage} - ${ms || '---'} ms\r\n`);
                    msgAll.push(`ResponseBody: ${JSON.stringify(responseBody, null, 4)}\r\n`);
                } else {
                    msgAll.push(`${new Date().toISOString()} - LogType: ${logType} - ${request.method} ${request.originalUrl} - ${response.statusCode} - ${ms || '---'} ms\r\n`);
                }
                Logger.Save(msgAll);
            }
        });
        response.on('close', () => {
            if (!response.logged) {
                response.logged = true;
                const logType = 'error';
                const msgAll = [`${new Date().toISOString()} - LogType: ${logType} - ${request.method} ${request.originalUrl} - connection closed, maybe timed out\r\n`];
                Logger.Save(msgAll);
            }
        });
        next();
    }

    static async Save(msgAll) {
        const { log: { logApiFilename, logApiPath } } = common_config;
        try {
            if (!fs.existsSync(logApiPath)) {
                fs.mkdirSync(logApiPath, { recursive: true });
            }
            const fileName = `${logApiPath}/${logApiFilename}`;
            await fs.writeFile(fileName, msgAll.join(''), { flag: 'a' }, (err) => {
                if (err) throw err;
            });
        } catch (error) {
            console.warn(`Request is not saved: ${error.message}`);
        }
    }
}
