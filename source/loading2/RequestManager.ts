/**
 * RequestManager interface for handling HTTP requests.
 * 
 * This interface defines methods for fetching resources and resolving URLs.
 */
export interface RequestManager {
  /**
   * Fetches a resource from the network.
   * 
   * @param input - The resource to fetch, which can be a URL string or a Request object.
   * @param init - Optional parameters for the request, such as method, headers, body, etc.
   */
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  
  /**
   * Get the URL for a given resource.
   * 
   * @param url - The URL of the resource to resolve.
   */
  getUrl(url: string): Promise<string>;
}
