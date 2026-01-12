import { http, HttpResponse } from 'msw';

// Define handlers for mocking API requests
export const handlers = [
  // NHTSA API mock
  http.get('https://api.nhtsa.gov/complaints/*', () => {
    return HttpResponse.json({
      results: [],
      count: 0,
    });
  }),

  // Add more handlers as needed for:
  // - Auth endpoints
  // - Internal API endpoints
  // - External services
];
