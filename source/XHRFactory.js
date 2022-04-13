export const XHRFactory = {
	config: {
		withCredentials: false,
		customHeaders: [
			{header: null, value: null}
		]
	},

	createXMLHttpRequest: function() 
	{
		const xhr = new XMLHttpRequest();

		if (this.config.customHeaders &&
			Array.isArray(this.config.customHeaders) &&
			this.config.customHeaders.length > 0) 
		{
			const baseOpen = xhr.open;
			const customHeaders = this.config.customHeaders;
			xhr.open = function() 
			{
				baseOpen.apply(this, [].slice.call(arguments));
				customHeaders.forEach(function(customHeader) 
				{
					if (Boolean(customHeader.header) && Boolean(customHeader.value)) 
					{
						xhr.setRequestHeader(customHeader.header, customHeader.value);
					}
				});
			};
		}

		return xhr;
	},

	fetch: async function(resource) 
	{
		const headers = new Headers();
		if (this.config.customHeaders) 
		{
			this.config.customHeaders.forEach(function(customHeader) 
			{
				if (Boolean(customHeader.header) && Boolean(customHeader.value)) 
				{
					headers.append(customHeader.header, customHeader.value);
				}
			});
		}
		const options = {
			headers: headers,
			credentials: XHRFactory.config.withCredentials ? 'include' : 'same-origin'
		};
		return fetch(resource, options);
	}
};
