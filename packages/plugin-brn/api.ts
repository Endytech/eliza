import {
    elizaLogger,
    IAgentRuntime,
} from "@elizaos/core";

export async function getCollectionItems(
    brnHost: string,
    collectionId: string,
    brnApiKey: string,
    offset?: number,
    limit?: number,
    sortField?: string,
    sortDirection?: string,
    viewed?: string,
): Promise<any> {
    let queryParams = `text_cut=false`;
    if (limit) queryParams += `&limit=${limit}`;
    if (offset) queryParams += `&offset=${offset}`;
    if (sortField) queryParams += `&sort_field=${sortField}`;
    if (sortDirection) queryParams += `&sort_direction=${sortDirection}`;
    if (viewed) queryParams += `&viewed=${viewed}`;
    const response = await fetch(
        `${brnHost}/items/${collectionId}?${queryParams}`,
        {
            method: "GET",
            headers: {
                "x-access-token": brnApiKey,
                "Content-Type": "application/json",
            },
        }
    );
    if (!response.ok) throw new Error(`Get Brn collection items request failed: ${response.statusText}`);
    const responseFetch = await response.json();
    if (!responseFetch.status) throw new Error(`Get Brn collection items failed: status ${responseFetch.status}, error - ${responseFetch.error}`);
    return responseFetch;
}

export async function setViewedCollectionItems(
    brnHost: string,
    itemId: string,
    brnApiKey: string,
): Promise<any> {
    const response = await fetch(
        `${brnHost}/item/${itemId}/view`,
        {
            method: "POST",
            headers: {
                "x-access-token": brnApiKey,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                viewed: true,
            }),
        }
    );
    if (!response.ok) throw new Error(`Set View for item: ${itemId}} of the Brn collection request failed: ${response.statusText}`);
    const responseFetch = await response.json();
    if (!responseFetch.status) throw new Error(`Set View for item: ${itemId}} of the Brn collection failed: status ${responseFetch.status}, error - ${responseFetch.error}`);
}

export const getBrnNews = async (
    data: {
    brnHost: string;
    collectionIds: string;
    brnApiKeys: string;
    offset?: number;
    limit?: number;
    sortField?: string;
    sortDirection?: string;
    setViewed?: boolean;
    viewed?: string;
},
runtime: IAgentRuntime
): Promise<{
    success: boolean;
    data?: string;
    error?: any;
}> => {
    try {
        const collectionIdsArray = data.collectionIds.split(',').map(id => id.trim());
        const brnApiKeysArray = data.brnApiKeys.split(',').map(id => id.trim());
        elizaLogger.info("Get Brn collection with option:", data);

        let result = '';
        for (const [index, collectionId] of collectionIdsArray.entries()) {
            try {
                const brnApiKey = brnApiKeysArray[index];
                const itemsFetch = await getCollectionItems(data.brnHost, collectionId, brnApiKey, data.offset, data.limit, data.sortField, data.sortDirection, data.viewed)
                if (itemsFetch.items && itemsFetch.items.length > 0) {
                    const items = itemsFetch.items.map((item) => {
                        return {
                            title: item?.fields?.title,
                            description: item?.fields?.description,
                            date: item?.fields?.date
                        };
                    });
                    result += JSON.stringify(items);
                    if (data.setViewed) {
                        for (const item of itemsFetch.items) {
                            try {
                                await setViewedCollectionItems(data.brnHost, item.item_id, brnApiKey)
                            } catch (error) {
                                elizaLogger.error(error);
                            }
                        }
                    }
                }
            } catch (error) {
                elizaLogger.error(`Get Brn News collection '${collectionId}' failed:  Error - ${error}`)
            }
        }
        if (result === '') throw new Error(`Get empty Brn News of all collections`);
        return { success: true, data: result };
    } catch (error) {
        elizaLogger.error(`Get Brn News failed. Error - ${error}`);
        return { success: false, error: error };
    }
}
