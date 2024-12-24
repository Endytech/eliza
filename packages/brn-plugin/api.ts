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
    elizaLogger.info("Get Brn collection with option:", data);
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
                `Get Brn collection failed: ${response.statusText}`
            );
        }
        const itemsFetch = await response.json();
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
        }
        return { success: true, data: result };
    } catch (error) {
        console.error(error);
        return { success: false, error: error };
    }
}
