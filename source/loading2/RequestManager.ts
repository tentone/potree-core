export interface RequestManager {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  getUrl(url: string): Promise<string>;
}

/* Example Custom RequestManager

class CustomRequestManager implements RequestManager 
{
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    throw new Error("Method not implemented.")
  }

  async getUrl(url: string): Promise<string> {
    return url;
  }
}

*/
