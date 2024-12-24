import {
    elizaLogger,
    IAgentRuntime,
} from "@elizaos/core";

export const getBrnCollectionItems = async (
    data: {
    brn_host: string;
    collectionId: string;
    offset?: number;
    limit?: number;
},
runtime: IAgentRuntime
): Promise<{
    success: boolean;
    data?: string;
    error?: any;
}> => {
    elizaLogger.info("Get news with option:", data);
    const brnApiKey = runtime.getSetting("BRN_API_KEY");

    try {
        const response = await fetch(
            `${data.brn_host}/items/${data.collectionId}?text_cut=false&limit=${data.limit}&offset=${data.offset}`,
            {
                method: "GET",
                headers: {
                    "x-access-token": brnApiKey,
                    "Content-Type": "application/json",
                },
            }
        );

        if (!response.ok) {
            throw new Error(
                `Get news failed: ${response.statusText}`
            );
        }
        const itemsFetch = await response.json();
        elizaLogger.info("newsFetch.items.length", itemsFetch.items.length);
        let result = '';
        if (itemsFetch.items && itemsFetch.items.length > 0) {
            const items = itemsFetch.items.map((item) => {
                return {
                    title: item?.fields?.title,
                    description: item?.fields?.description,
                    date: item?.fields?.date
                };
            });
            result = JSON.stringify(items);
            // result = itemsFetch.items.map((item) => `${item?.fields?.title}. ${item?.fields?.description}. Date - ${item?.fields?.date}.\n`).join(', ');
            // for (const item of newsFetch.items){
            //     elizaLogger.info("item", item);
            //     const title = item?.fields?.title || "No Title"; // Fallback if title is missing
            //     const description = item?.fields?.description || "No Description"; // Fallback if description is missing
            //     const date = item?.fields?.date || "No Date"; // Fallback if date is missing
            //     elizaLogger.info("result", `${title}. ${description}. Date - ${date}.\n`);
            // }
            // result = newsFetch.items.map((item) => {
            //     elizaLogger.info("item", item);
            //     const title = item?.fields?.title || "No Title"; // Fallback if title is missing
            //     const description = item?.fields?.description || "No Description"; // Fallback if description is missing
            //     const date = item?.fields?.date || "No Date"; // Fallback if date is missing
            //     return `${title}. ${description}. Date - ${date}.\n`;
            // }).join(', ')
        }
        return { success: true, data: result };
    } catch (error) {
        console.error(error);
        return { success: false, error: error };
    }
}
