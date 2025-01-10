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
import { IMAGE_GENERATION_CONSTANTS } from "./constants";

export async function saveImage(data: string, filename: string, isBase64: boolean = true): Promise<string> {
    const imageDir = path.join(process.cwd(), "generatedImages");

    // Убедитесь, что директория существует
    if (!fs.existsSync(imageDir)) {
        fs.mkdirSync(imageDir, { recursive: true });
    }

    const filepath = path.join(imageDir, `${filename}.png`);

    if (isBase64) {
        // Удаляем префикс base64, если он есть
        const base64Image = data.replace(/^data:image\/\w+;base64,/, "");
        const imageBuffer = Buffer.from(base64Image, "base64");
        fs.writeFileSync(filepath, imageBuffer);
    } else {
        // Скачиваем изображение по URL
        const response = await fetch(data);
        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const imageBuffer = Buffer.from(arrayBuffer);
        fs.writeFileSync(filepath, imageBuffer);
    }
    if (!fs.existsSync(filepath)) {
        throw new Error(`Image file not created: ${filepath}`);
    }

    return filepath;
}

const waitForCompletion = async (id: string, apiKey: string): Promise<any> => {
    const statusUrl = `https://api.runpod.ai/v2/ez7djx79dzbno3/status/${id}`;

    while (true) {
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
            elizaLogger.log(`Status: ${status}. Retrying in 10 seconds...`);
            await new Promise((resolve) => setTimeout(resolve, 10000));
        } else {
            throw new Error(`Unexpected status: ${status}`);
        }
    }
};

export const generateImage = async (prompt: string, runtime: IAgentRuntime) => {
    const apiKey = runtime.getSetting("SD_IMAGE_GEN_API_KEY") || IMAGE_GENERATION_CONSTANTS.API_KEY_SETTING;
    const imageSettings = runtime.getSetting("imageSettings");
    try {
        elizaLogger.log("Starting image generation with prompt:", prompt);

        const loraMapping = {
            "<lora:PusheenIXL:1.0>": "waiNSFWIllustrious_v70.safetensors"
        };
        let sdModelCheckpoint = "ponyDiffusionV6XL_v6StartWithThisOne.safetensors";
        for (const [key, value] of Object.entries(loraMapping)) {
            if (prompt.includes(key)) sdModelCheckpoint = value;
        }

        const params = {
            input: {
                api_name: "txt2img",
                id: crypto.randomUUID(),
                task_id: `task_${Date.now()}`,
                webhook: null,
                prompt,
                negative_prompt: imageSettings?.negative_prompt || "(((Group photo))), (((more than one person))), (((mutation))), (((deformed))), ((ugly)), blurry, ((bad anatomy)), (((bad proportions))), ((extra limbs)), (((cloned face))), text, signature, Doll, deformed, asymmetric, cropped, censored, frame, mock-up, lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, worst quality, low quality, normal quality, jpeg artifacts, watermark, username, blurry, artist name",
                guidance: 12,
                strength: 1,
                sampler: imageSettings?.sampler || "Euler a",
                steps: 30,
                override_settings: {
                    sd_model_checkpoint: imageSettings?.sd_model_checkpoint || sdModelCheckpoint
                },
            },
        };
        elizaLogger.debug("Starting image generation with params:", params);
        
        const apiUrl =  runtime.getSetting("SD_IMAGE_GEN_API_URL") || IMAGE_GENERATION_CONSTANTS.API_URL;
        const response = await fetch(apiUrl, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                accept: "application/json",
                "Content-Type": "application/json",
            },
            body: JSON.stringify(params),
        });

        if (!response.ok) {
            const errorText = await response.text();
            elizaLogger.error("Image generation API error:", {
                status: response.status,
                statusText: response.statusText,
                error: errorText,
            });
            throw new Error(
                `Image generation API error: ${response.statusText} - ${errorText}`
            );
        }

        const data = await response.json();
        elizaLogger.log("Generation request submitted. Received response:", data);

        const { id, status } = data;

        if (!id || !status) {
            throw new Error("Response does not include 'id' or 'status'.");
        }

        elizaLogger.log(`Waiting for completion of task with id: ${id}`);
        const completedData = await waitForCompletion(id, apiKey);

        if (!completedData.output?.images || completedData.output.images.length === 0) {
            throw new Error("No images returned in the completed response.");
        }

        const filename = `generated_image_${Date.now()}`;
        const imagePath = await saveImage(
            completedData.output.images[0],
            filename,
            true
        );

        return {
            success: true,
            imagePath,
            additionalData: {
                delayTime: completedData.delayTime,
                executionTime: completedData.executionTime,
                id: completedData.id,
            },
        };
    } catch (error) {
        elizaLogger.error("Image generation error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error occurred",
        };
    }
};

const imageSDGeneration: Action = {
    name: "GENERATE_SD_IMAGE",
    similes: [
        "IMAGE_GENERATION",
        "IMAGE_GEN",
        "CREATE_IMAGE",
        "MAKE_IMAGE",
        "GENERATE_PICTURE",
        "PICTURE_GEN",
        "IMAGE_CREATE",
        "DRAW_IMAGE",
    ],
    description: "Generate an image based on a text prompt",
    validate: async (runtime: IAgentRuntime, _message: Memory) => {
        elizaLogger.log("Validating image generation action");
        const apiKey = runtime.getSetting("SD_IMAGE_GEN_API_KEY") || IMAGE_GENERATION_CONSTANTS.API_KEY_SETTING;
        elizaLogger.log("SD_IMAGE_GEN_API_KEY present:", !!apiKey);
        const apiUrl =  runtime.getSetting("SD_IMAGE_GEN_API_URL") || IMAGE_GENERATION_CONSTANTS.API_URL;
        elizaLogger.log("SD_IMAGE_GEN_API_URL present:", !!apiUrl);
        return !!apiKey && !!apiUrl;
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        _state: State,
        _options: any,
        callback: HandlerCallback
    ) => {
        elizaLogger.log("Image generation request:", message);

        const imagePrompt = message.content.text
            .replace(/<@\d+>/g, "") // Удаляем упоминания
            .replace(
                /generate image|create image|make image|draw image/gi,
                ""
            ) // Удаляем команды
            .trim();

        if (!imagePrompt || imagePrompt.length < 5) {
            callback({
                text: "Please provide more details about the image you'd like me to generate. For example: 'Generate an image of a futuristic city' or 'Create a picture of a sunny beach.'",
            });
            return;
        }

        elizaLogger.log("Image prompt:", imagePrompt);

        callback({
            text: `I'll generate an image based on your prompt: "${imagePrompt}". This might take a few moments...`,
        });

        try {
            const result = await generateImage(imagePrompt, runtime);

            if (result.success) {
                const { imagePath, additionalData } = result;
                elizaLogger.log("imageSDGeneration result.success url:", imagePath);
                callback(
                    {
                        text: `Here's your generated image (Execution time: ${additionalData.executionTime}ms):`,
                        attachments: [
                            {
                                id: crypto.randomUUID(),
                                url: imagePath,
                                title: "Generated Image",
                                source: "imageSDGeneration",
                                description: imagePrompt,
                                text: imagePrompt,
                                contentType: "image/png", // Убедитесь, что тип контента указан
                            },
                        ],
                    },
                    [imagePath]
                );
            } else {
                callback({
                    text: `Image generation failed: ${result.error}`,
                    error: true,
                });
            }
        } catch (error) {
            elizaLogger.error(`Failed to generate image. Error: ${error}`);
            callback({
                text: `Image generation failed: ${error.message}`,
                error: true,
            });
        }
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: { text: "Generate an image of a cat in space" },
            },
            {
                user: "{{agentName}}",
                content: {
                    text: "I'll create an image of a cat in space for you",
                    action: "GENERATE_SD_IMAGE",
                },
            },
        ],
    ],
} as Action;

export const imageSDGenerationPlugin: Plugin = {
    name: "imageSDGeneration",
    description: "Generate images using your custom API",
    actions: [imageSDGeneration],
    evaluators: [],
    providers: [],
};
