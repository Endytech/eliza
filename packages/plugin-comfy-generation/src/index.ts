import { elizaLogger } from "@elizaos/core";
import {
    Action,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    Plugin,
    State,
} from "@elizaos/core";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import fetch from "node-fetch";
import { VIDEO_GENERATION_CONSTANTS } from "./constants";

const waitForCompletion = async (id: string, apiKey: string): Promise<any> => {
    const statusUrl = `https://api.runpod.ai/v2/xdbri7uws2192p/status/${id}`;
    const maxRetries = 100; // Максимальное количество проверок
    let retryCount = 0;

    while (retryCount < maxRetries) {
        const response = await fetch(statusUrl, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                accept: "application/json",
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Error fetching status: ${errorText}`);
        }

        const statusData = await response.json();
        elizaLogger.log("Status check response:", statusData);

        const { status } = statusData;

        if (status === "COMPLETED") {
            return statusData;
        } else if (status === "IN_QUEUE" || status === "IN_PROGRESS") {
            elizaLogger.log(`Status: ${status}. Retrying in 30 seconds...`);
            retryCount++;
            await new Promise((resolve) => setTimeout(resolve, 30000));
        } else {
            throw new Error(`Unexpected status: ${status}`);
        }
    }
    throw new Error("Task timeout: Maximum retries exceeded.");
};

export const generateSDVideo = async (promptData: any, runtime: any) => {
    const apiKey = runtime.getSetting("SD_VIDEO_GEN_API_KEY");
    const apiUrl = runtime.getSetting("SD_VIDEO_GEN_API_URL");
    if (!apiKey || !apiUrl) {
        throw new Error("Missing API key or API URL in runtime settings");
    }

    try {
        const params = {
            input: {
                task_id: Date.now(),
                webhook: "https://api.brn.ai/",
                prompt: promptData // Используем обновленный promptData
            },
        };

        console.log("Starting video generation with params:", params);

        const response = await fetch(apiUrl, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(params),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Video generation API error:", {
                status: response.status,
                statusText: response.statusText,
                error: errorText,
            });
            throw new Error(
                `Video generation API error: ${response.statusText} - ${errorText}`
            );
        }

        const initialData = await response.json();
        console.log("Initial response received:", initialData);

        const { id, status } = initialData;

        if (!id || !status) {
            throw new Error("Response does not include 'id' or 'status'.");
        }

        console.log(`Waiting for completion of task with id: ${id}`);
        const completedData = await waitForCompletion(id, apiKey);

        const videoUrls = completedData.output?.[0]?.[0]?.message?.urls;
        if (!videoUrls) {
            throw new Error("No video URLs returned in the response.");
        }

        const videoDir = path.join(process.cwd(), "generatedVideos");
        if (!fs.existsSync(videoDir)) {
            fs.mkdirSync(videoDir, { recursive: true });
        }

        const videoFilename = `generated_video_${Date.now()}.mp4`;
        const videoResponse = await fetch(videoUrls);
        if (!videoResponse.ok) {
            throw new Error(`Failed to download video: ${videoResponse.statusText}`);
        }

        const videoBuffer = await videoResponse.buffer();
        const videoPath = path.join(videoDir, videoFilename);
        fs.writeFileSync(videoPath, videoBuffer);

        console.log(`Video saved to ${videoPath}`);

        return {
            success: true,
            videoPath,
            additionalData: {
                delayTime: completedData.delayTime,
                executionTime: completedData.executionTime,
                id: completedData.id,
            },
        };
    } catch (error) {
        console.error("Video generation error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error occurred",
        };
    }
};

export const videoSDGeneration: Action = {
    name: "GENERATE_SD_VIDEO",
    similes: [
        "VIDEO_GENERATION",
        "VIDEO_GEN",
        "CREATE_VIDEO",
        "MAKE_VIDEO",
        "GENERATE_MOVIE",
        "MOVIE_GEN",
        "VIDEO_CREATE",
        "MAKE_FILM",
    ],
    description: "Generate a video based on a text prompt",
    validate: async (runtime: IAgentRuntime, _message: Memory) => {
        elizaLogger.log("Validating video generation action");
        const apiKey = runtime.getSetting("SD_VIDEO_GEN_API_KEY");
        const apiUrl = runtime.getSetting("SD_VIDEO_GEN_API_URL");
        elizaLogger.log("SD_VIDEO_GEN_API_KEY present:", !!apiKey);
        elizaLogger.log("SD_VIDEO_GEN_API_URL present:", !!apiUrl);
        return !!apiKey && !!apiUrl;
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        _state: State,
        _options: any,
        callback: HandlerCallback
    ) => {
        elizaLogger.log("Video generation request:", message);

        const videoPrompt = message.content.text
            .replace(/<@\d+>/g, "") // Удаляем упоминания
            .replace(
                /generate video|create video|make video|generate movie|make film/gi,
                ""
            ) // Удаляем команды
            .trim();

        if (!videoPrompt || videoPrompt.length < 5) {
            callback({
                text: "Please provide more details about the video you'd like me to generate. For example: 'Generate a video of a futuristic city' or 'Create a video of a sunny beach.'",
            });
            return;
        }

        elizaLogger.log("Video prompt:", videoPrompt);

        callback({
            text: `I'll generate a video based on your prompt: "${videoPrompt}". This might take a few moments...`,
        });

        try {
            // Загрузка шаблона prompt.json
            const promptData = JSON.parse(fs.readFileSync("../prompt.json", "utf-8"));

            // Динамическая подстановка prompt в "44.inputs.text"
            promptData["44"]["inputs"]["text"] = videoPrompt;

            elizaLogger.log("Updated prompt data for video generation:", promptData);

            // Вызов функции генерации видео
            const result = await generateSDVideo(promptData, runtime);

            if (result.success) {
                const { videoPath, additionalData } = result;
                elizaLogger.log("videoSDGeneration result.success url:", videoPath);
                callback(
                    {
                        text: `Here's your generated video (Execution time: ${additionalData.executionTime}ms):`,
                        attachments: [
                            {
                                id: crypto.randomUUID(),
                                url: videoPath,
                                title: "Generated Video",
                                source: "videoSDGeneration",
                                description: videoPrompt,
                                text: videoPrompt,
                                contentType: "video/mp4", // Убедитесь, что тип контента указан
                            },
                        ],
                    },
                    [videoPath]
                );
            } else {
                callback({
                    text: `Video generation failed: ${result.error}`,
                    error: true,
                });
            }
        } catch (error) {
            elizaLogger.error(`Failed to generate video. Error: ${error}`);
            callback({
                text: `Video generation failed: ${error.message}`,
                error: true,
            });
        }
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: { text: "Generate a video of a wolf in New York" },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "I'll create a video of a wolf in New York for you",
                    action: "GENERATE_SD_VIDEO",
                },
            },
        ],
    ],
} as Action;

export const videoSDGenerationPlugin: Plugin = {
    name: "videoSDGeneration",
    description: "Generate videos using your custom API",
    actions: [videoSDGeneration], // Используем действие videoSDGeneration
    evaluators: [],
    providers: [],
};
