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
    elizaLogger.info("url", `${brnHost}/items/${collectionId}?${queryParams}`);
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
    if (!response.ok) throw new Error(`Get Brn collection request failed: ${response.statusText}`);
    const itemsFetch = await response.json();
    elizaLogger.info("itemsFetch", itemsFetch);
    if (!itemsFetch.status) throw new Error(`Get Brn collection failed: status ${itemsFetch.status}, error - ${itemsFetch.error}`);
    return itemsFetch;
}

export const getBrnCollectionItems = async (
    data: {
    brnHost: string;
    collectionId: string;
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
    elizaLogger.info("Get Brn collection with option:", data);
    const brnApiKey = runtime.getSetting("BRN_API_KEY");
    // `${data.brnHost}/items/${data.collectionId}?sort_field=date&sort_direction=-1&viewed=0&text_cut=false&limit=${data.limit}&offset=${data.offset}`,
    try {
    //     const response = await fetch(
    //         `${data.brnHost}/items/${data.collectionId}?sort_field=date&sort_direction=-1&viewed=0&text_cut=false&limit=${data.limit}&offset=${data.offset}`,
    //         {
    //             method: "GET",
    //             headers: {
    //                 "x-access-token": brnApiKey,
    //                 "Content-Type": "application/json",
    //             },
    //         }
    //     );
    //
    //     if (!response.ok) {
    //         throw new Error(
    //             `Get Brn collection failed: ${response.statusText}`
    //         );
    //     }
    //     const itemsFetch = await response.json();
        const itemsFetch = await getCollectionItems(data.brnHost, data.collectionId, brnApiKey, data.offset, data.limit, data.sortField, data.sortDirection, data.viewed)

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
            if (data.setViewed) {
                for (const item of itemsFetch.items) {
                    try {
                        const response = await fetch(
                            `${data.brnHost}/item/${item.item_id}/view`,
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
                        if (!response.ok) {
                            throw new Error(
                                `Set View for item: ${item.item_id}} of the Brn collection failed: ${response.statusText}`
                            );
                        }
                    } catch (error) {
                        console.error(error);
                    }
                }
            }
        }
        return { success: true, data: result };
    } catch (error) {
        console.error(error);
        return { success: false, error: error };
    }
}
